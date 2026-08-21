# Kubernetes Cluster Setup (EKS)

This directory contains Terraform and Kubernetes manifests for provisioning the DevAtlas EKS cluster.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.5.0
- kubectl >= 1.27.0
- eksctl >= 0.163.0 (optional, for quick cluster creation)

## Cluster Architecture

```
VPC (10.0.0.0/16)
├── Public Subnets (3 AZs)
│   └── Bastion Host / ALB Ingress
├── Private Subnets (3 AZs)
│   ├── EKS Managed Node Groups
│   │   ├── system (3 nodes, m5.large)
│   │   ├── backend (3-20 nodes, m5.xlarge)
│   │   └── worker (1-5 nodes, m5.large)
│   └── RDS PostgreSQL (Multi-AZ)
└── Data Subnets (3 AZs)
    └── ElastiCache Redis
       └── S3 VPC Endpoint
```

## Quick Start

### Option 1: Using eksctl (Development)

```bash
# Create cluster
eksctl create cluster \
  --name devatlas-prod \
  --region us-east-1 \
  --version 1.29 \
  --vpc-cidr 10.0.0.0/16 \
  --nodegroup-name system \
  --nodes 3 \
  --node-type m5.large \
  --nodes-min 3 \
  --nodes-max 20 \
  --managed \
  --with-oidc \
  --ssh-access \
  --asg-access

# Add node groups
eksctl create nodegroup --cluster devatlas-prod --region us-east-1 --name backend --node-type m5.xlarge --nodes 3 --nodes-min 3 --nodes-max 20 --managed
eksctl create nodegroup --cluster devatlas-prod --region us-east-1 --name worker --node-type m5.large --nodes 1 --nodes-min 1 --nodes-max 5 --managed
```

### Option 2: Using Terraform (Production)

```bash
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

## Terraform Modules

### VPC Module
Creates VPC with public, private, and data subnets across 3 AZs.

### EKS Module
Creates EKS cluster with:
- Managed node groups (system, backend, worker)
- Fargate profile for kube-system pods
- Cluster IAM role with necessary policies
- OIDC provider for service accounts

### RDS Module
Creates PostgreSQL 16 with PostGIS:
- Multi-AZ deployment
- Automated backups (7 days)
- Encryption at rest
- Performance Insights

### ElastiCache Module
Creates Redis 7 cluster:
- Cluster mode enabled
- 3 shards, 2 replicas each
- Encryption in transit
- Automatic failover

## kubeconfig Setup

```bash
aws eks update-kubeconfig --region us-east-1 --name devatlas-prod
```

## Verify Cluster

```bash
kubectl get nodes
kubectl get pods -A
kubectl cluster-info
```

## Add-ons to Install

### CoreDNS
```bash
eksctl utils install-coredns --cluster devatlas-prod --region us-east-1
```

### AWS Load Balancer Controller
```bash
# Create IAM role for LB controller
eksctl create iamserviceaccount \
  --cluster devatlas-prod \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::123456789012:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install via Helm
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=devatlas-prod \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

### External DNS
```bash
eksctl create iamserviceaccount \
  --cluster devatlas-prod \
  --namespace=kube-system \
  --name=external-dns \
  --attach-policy-arn=arn:aws:iam::123456789012:policy/ExternalDNSIAMPolicy \
  --approve

helm install external-dns bitnami/external-dns \
  -n kube-system \
  --set provider=aws \
  --set aws.region=us-east-1 \
  --set serviceAccount.create=false \
  --set serviceAccount.name=external-dns
```

### Metrics Server
```bash
helm install metrics-server bitnami/metrics-server \
  -n kube-system \
  --set apiService.create=true
```

### Cluster Autoscaler
```bash
eksctl create iamserviceaccount \
  --cluster devatlas-prod \
  --namespace=kube-system \
  --name=cluster-autoscaler \
  --attach-policy-arn=arn:aws:iam::123456789012:policy/ClusterAutoscalerIAMPolicy \
  --approve

helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  -n kube-system \
  --set autoDiscovery.clusterName=devatlas-prod \
  --set awsRegion=us-east-1 \
  --set serviceAccount.create=false \
  --set serviceAccount.name=cluster-autoscaler
```

## Ingress Configuration

After installing AWS Load Balancer Controller:

```bash
kubectl apply -f ../ingress.yaml
```

## Secrets Management

Store secrets in AWS Secrets Manager and use the AWS Secrets and Configuration Provider (ASCP):

```bash
# Create secret
aws secretsmanager create-secret \
  --name devatlas/prod/database-url \
  --secret-string "postgresql+asyncpg://user:pass@host:5432/db"

# Annotate service account to use the secret
kubectl annotate serviceaccount devatlas-backend \
  eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/devatlas-backend-role
```

## Scaling Configuration

The HPA manifests in this directory are pre-configured for:
- Backend: 3-20 replicas, scale up immediately, scale down after 5 minutes
- Worker: 1-5 replicas, scale up after 1 minute, scale down after 10 minutes

## Monitoring

Install Prometheus and Grafana via kube-prometheus-stack:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set grafana.persistence.storageClassName=gp3
```

## Troubleshooting

### Node Not Joining Cluster
```bash
# Check node auth
aws eks describe-cluster --name devatlas-prod --region us-east-1
# View node logs
kubectl describe node <node-name>
```

### Pods Pending
```bash
# Check resource requests
kubectl describe pod <pod-name>
# Check if node has capacity
kubectl describe node <node-name> | grep -A 5 "Allocated resources"
```

### Ingress Not Working
```bash
# Check LB controller logs
kubectl logs -n kube-system -l app=aws-load-balancer-controller
# Check ingress events
kubectl describe ingress <ingress-name>
```