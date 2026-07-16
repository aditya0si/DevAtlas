# PostgreSQL Read Replica Promotion Runbook

This document describes the procedure for promoting a PostgreSQL read replica to become the new primary for read scaling or during DR scenarios.

## When to Promote

- **Read scaling**: When read traffic exceeds primary capacity
- **DR failover**: When primary becomes unavailable
- **Maintenance**: Planned primary migration
- **Testing**: Validating replica lag and data integrity

## Pre-promotion Checklist

### 1. Verify Replica Health

```bash
# Connect to replica and check status
psql -h postgres-replica -U devatlas -d devatlas

# Check replication lag
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;

# Check if replica is catching up
SELECT * FROM pg_stat_replication;

# Verify no long-running transactions
SELECT pid, usename, application_name, state, 
       now() - xact_start AS duration, query
FROM pg_stat_activity 
WHERE state != 'idle' 
  AND application_name != '';
```

### 2. Check Application Impact

```bash
# Review active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'devatlas';

# Check for locks
SELECT blocked.pid, blocked.usename, blocked.query, 
       blocking.pid AS blocking_pid, blocking.query AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```

### 3. Backup Primary

```bash
# Create pre-promotion backup
pg_dump -h postgres-primary -U devatlas -d devatlas -F custom -b -v -f /backups/pre_promotion_$(date +%Y%m%d_%H%M%S).dump

# Verify backup integrity
pg_restore --dbname=devatlas_test /backups/pre_promotion_latest.dump
```

## Promotion Procedure

### Option A: Managed RDS (AWS)

```bash
# 1. Stop writes to primary (scale to 0 if using Kubernetes)
kubectl scale deployment devatlas-backend --replicas=0 -n devatlas

# 2. Wait for replica to catch up
aws rds wait dbinstance-available --db-instance-identifier devatlas-replica

# 3. Promote replica
aws rds promote-read-replica \
  --db-instance-identifier devatlas-replica \
  --backup-retention-period 7 \
  --preferred-maintenance-window "sun:04:00-sun:05:00"

# 4. Wait for promotion to complete
aws rds wait dbinstance-available --db-instance-identifier devatlas-replica

# 5. Get new endpoint
aws rds describe-db-instances --db-instance-identifier devatlas-replica \
  --query 'DBInstances[0].Endpoint.Address'

# 6. Update secrets
aws secretsmanager update-secret \
  --secret-id devatlas/prod/database-url \
  --secret-string "postgresql+asyncpg://user:pass@<NEW_ENDPOINT>:5432/devatlas"

# 7. Restart backend with new connection
kubectl scale deployment devatlas-backend --replicas=3 -n devatlas
```

### Option B: Self-managed PostgreSQL

```bash
# 1. Stop writes
kubectl scale deployment devatlas-backend --replicas=0 -n devatlas

# 2. Stop replication on replica
psql -h postgres-replica -U postgres -c "SELECT pg_stop_replication();"

# 3. Create trigger file for promotion
ssh user@postgres-replica "touch /var/lib/postgresql/data/promote.trigger"

# 4. Verify promotion
psql -h postgres-replica -U postgres -c "SELECT pg_is_in_recovery();"
# Should return 'f' (false) - means it's now primary

# 5. Update pg_hba.conf on new primary for replication
# Add: host replication all 0.0.0.0/0 md5

# 6. Reload configuration
psql -h postgres-replica -U postgres -c "SELECT pg_reload_conf();"

# 7. Configure backup on new primary
# Set up continuous archiving to S3
```

## Post-promotion Steps

### 1. Verify Data Integrity

```bash
# Run consistency check
psql -h <NEW_PRIMARY> -U devatlas -d devatlas -c "SELECT count(*) FROM users;"
psql -h <NEW_PRIMARY> -U devatlas -d devatlas -c "SELECT count(*) FROM repositories;"
psql -h <NEW_PRIMARY> -U devatlas -d devatlas -c "SELECT count(*) FROM github_events;"

# Compare with known good counts
```

### 2. Update Connection Strings

```bash
# Update Kubernetes secrets
kubectl create secret generic devatlas-db-config \
  --from-literal=DATABASE_URL="postgresql+asyncpg://user:pass@<NEW_PRIMARY>:5432/devatlas" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart backend to pick up new connection
kubectl rollout restart deployment/devatlas-backend -n devatlas
```

### 3. Configure New Replica (Old Primary)

```bash
# If old primary is recoverable, configure as new replica
# On old primary:
psql -h <OLD_PRIMARY> -U postgres -c "ALTER USER postgres WITH REPLICATION;"

# Create replication slot on new primary
psql -h <NEW_PRIMARY> -U postgres -c "SELECT * FROM pg_create_physical_replication_slot('replica_slot');"

# Add to pg_hba.conf on new primary:
# host replication all <OLD_PRIMARY_IP>/32 md5

# Configure streaming replication on old primary
cat >> /var/lib/postgresql/data/postgresql.conf << EOF
primary_conninfo = 'host=<NEW_PRIMARY> port=5432 user=replication password=<PASSWORD> application_name=postgres_replica'
primary_slot_name = 'replica_slot'
wal_level = replica
max_wal_senders = 10
hot_standby = on
EOF

# Restart old primary
sudo systemctl restart postgresql
```

### 4. Update Monitoring

```bash
# Update Prometheus scrape configs for new primary
kubectl edit configmap prometheus-server -n monitoring

# Update Grafana datasources
# Navigate to Grafana > Configuration > Data Sources > Edit PostgreSQL
# Update host to new primary endpoint
```

### 5. Verify Replication (New Setup)

```bash
# On new primary
SELECT * FROM pg_stat_replication;

# On new replica
SELECT pg_is_in_recovery();
# Should return 't' (true)

# Check replication lag
SELECT now() - pg_last_xact_replay_timestamp() AS lag FROM pg_stat_replication;
```

## Rollback Procedure

If promotion causes issues:

```bash
# 1. Stop applications
kubectl scale deployment devatlas-backend --replicas=0 -n devatlas

# 2. Demote new primary back to replica
# On new primary:
psql -h <NEW_PRIMARY> -U postgres -c "SELECT pg_promote(false, true);"

# 3. Restore old primary
# If old primary is recoverable from WAL:
pg_ctl promote -D /var/lib/postgresql/data

# 4. Verify old primary is primary
psql -h <OLD_PRIMARY> -U postgres -c "SELECT pg_is_in_recovery();"
# Should return 'f'

# 5. Restore connections
kubectl scale deployment devatlas-backend --replicas=3 -n devatlas
```

## Automation with kubectl

Save this as a Kubernetes job for emergency promotion:

```yaml
# deploy/kubernetes/postgres-promotion-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: postgres-promotion
  namespace: devatlas
spec:
  template:
    spec:
      serviceAccountName: postgres-admin
      containers:
      - name: promotion
        image: postgres:16-alpine
        command:
        - /bin/sh
        - -c
        - |
          # Stop writes
          kubectl scale deployment devatlas-backend --replicas=0 -n devatlas
          
          # Wait for lag to be minimal
          while [ $(psql -h $PRIMARY -U postgres -t -c "SELECT EXTRACT(SECONDS FROM now() - pg_last_xact_replay_timestamp());" | tr -d ' ') -gt 5 ]; do
            echo "Waiting for replication lag < 5s..."
            sleep 10
          done
          
          # Promote
          psql -h $REPLICA -U postgres -c "SELECT pg_promote(true, true);"
          
          # Update DNS/secrets
          # ... (customize based on your setup)
          
          # Restart writes
          kubectl scale deployment devatlas-backend --replicas=3 -n devatlas
        env:
        - name: PRIMARY
          value: "postgres-primary.devatlas.svc.cluster.local"
        - name: REPLICA
          value: "postgres-replica.devatlas.svc.cluster.local"
      restartPolicy: Never
```

## Important Notes

1. **Zero-downtime promotion** requires application-level write buffering or DNS switching with low TTL
2. **Always test this procedure** in staging before production
3. **Document the actual steps taken** during each promotion for post-incident review
4. **Consider using Patroni** for automated failover with zero downtime
5. **PgBouncer** connection pooling may need restart to pick up new primary

## Related Documentation

- [PgBouncer Configuration](pgbouncer.yaml)
- [PostgreSQL Replica Deployment](postgres-replica.yaml)
- [Database Connection Management](../docs/database-connections.md)