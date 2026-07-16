# EKS Cluster Terraform Configuration
# DevAtlas Production Infrastructure

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "s3" {
    bucket = "devatlas-terraform-state"
    key    = "eks/cluster/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "devatlas-prod"
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.29"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

# ─────────────────────────────────────────────────────────────────────────────
# VPC Module
# ─────────────────────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  # 3 AZs for high availability
  azs                 = data.aws_availability_zones.available.names
  private_subnets     = [for i, az in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets      = [for i, az in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 4, i + 3)]
  database_subnets    = [for i, az in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 4, i + 6)]
  elasticache_subnets = [for i, az in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 4, i + 9)]

  enable_nat_gateway     = true
  single_nat_gateway    = false
  enable_dns_hostnames   = true
  enable_dns_support     = true

  tags = {
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    Environment = "prod"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# EKS Cluster
# ─────────────────────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  # Cluster IAM role
  create_cluster_security_group = true
  cluster_security_group_name   = "${var.cluster_name}-cluster-sg"

  # EKS addons
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cluster_log_retention_days = 30

  # OIDC provider for service accounts
  enable_oidc = true

  # Node groups
  eks_managed_node_groups = {
    system = {
      name = "system"
      instance_types = ["m5.large"]
      min_size       = 3
      max_size       = 6
      desired_size   = 3

      labels = {
        "nodegroup" = "system"
        "role"      = "system"
      }

      taints = []
    }

    backend = {
      name = "backend"
      instance_types = ["m5.xlarge"]
      min_size       = 3
      max_size       = 20
      desired_size   = 3

      labels = {
        "nodegroup" = "backend"
        "role"      = "application"
      }

      taints = []

      # Auto-scaling via Karpenter or Cluster Autoscaler
      capacity_reservation = {
        capacity_reservation_target = {
          capacity_reservation_preference = "open"
        }
      }
    }

    worker = {
      name = "worker"
      instance_types = ["m5.large"]
      min_size       = 1
      max_size       = 5
      desired_size   = 1

      labels = {
        "nodegroup" = "worker"
        "role"      = "background"
      }

      taints = []
    }
  }

  tags = {
    Environment = "prod"
    Project     = "DevAtlas"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Fargate Profile for kube-system
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_eks_fargate_profile" "kube_system" {
  cluster_name    = module.eks.cluster_name
  pod_execution_role_arn = aws_iam_role.fargate_pod_execution.arn
  subnet_ids      = module.vpc.private_subnets

  selector {
    namespace = "kube-system"
  }

  selector {
    namespace = "monitoring"
  }
}

resource "aws_iam_role" "fargate_pod_execution" {
  name = "${var.cluster_name}-fargate-pod-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "eks-fargate-pods.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "fargate_pod_execution" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy"
  role       = aws_iam_role.fargate_pod_execution.name
}

# ─────────────────────────────────────────────────────────────────────────────
# IRSA for AWS Load Balancer Controller
# ─────────────────────────────────────────────────────────────────────────────

module "lb_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-lb-controller"

  role_policy_arns = {
    policy = aws_iam_policy.lb_controller_policy.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_policy" "lb_controller_policy" {
  name = "${var.cluster_name}-lb-controller"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:CreateServiceLinkedRole"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeTags",
          "ec2:GetCoipPoolUsage",
          "ec2:DescribeCoipPools",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeTags"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:DescribeUserPoolClient",
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "iam:ListServerCertificates",
          "iam:GetServerCertificate",
          "waf-regional:GetWebACL",
          "waf-regional:GetWebACLForResource",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL",
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL",
          "shield:GetSubscriptionState",
          "shield:DescribeProtection",
          "shield:CreateProtection",
          "shield:DeleteProtection"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateSecurityGroup"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateTags"
        ]
        Resource = "arn:aws:ec2:*:*:security-group/*"
        Condition = {
          StringEquals = {
            "ec2:CreateAction" = "CreateSecurityGroup"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:AddUserAgent"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:DeleteSecurityGroup"
        ]
        Resource = "arn:aws:ec2:*:*:security-group/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/kubernetes.io/cluster/${var.cluster_name}" = "owned"
          }
        }
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# IRSA for External DNS
# ─────────────────────────────────────────────────────────────────────────────

module "external_dns_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-external-dns"

  role_policy_arns = {
    policy = aws_iam_policy.external_dns_policy.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:external-dns"]
    }
  }
}

resource "aws_iam_policy" "external_dns_policy" {
  name = "${var.cluster_name}-external-dns"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets"
        ]
        Resource = "arn:aws:route53:::hostedzone/*"
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ListHostedZones",
          "route53:ListResourceRecordSets"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# IRSA for External Secrets
# ─────────────────────────────────────────────────────────────────────────────

module "external_secrets_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-external-secrets"

  role_policy_arns = {
    policy = aws_iam_policy.external_secrets_policy.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:external-secrets"]
    }
  }
}

resource "aws_iam_policy" "external_secrets_policy" {
  name = "${var.cluster_name}-external-secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:*:*:secret:devatlas/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:ListSecrets"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────────────────────────────────────

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value      = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value      = module.eks.cluster_name
}

output "region" {
  description = "AWS region"
  value      = var.aws_region
}

output "vpc_id" {
  description = "VPC ID"
  value      = module.vpc.vpc_id
}

output "node_groups" {
  description = "Node group information"
  value       = module.eks.eks_managed_node_groups
}