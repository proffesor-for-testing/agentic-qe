---
name: test-environment-management
description: Test environment provisioning, infrastructure as code for testing, Docker/Kubernetes for test environments, service virtualization, and cost optimization. Use when managing test infrastructure, ensuring environment parity, or optimizing testing costs.
version: 1.0.0
category: testing-infrastructure
tags: [test-environments, docker, kubernetes, infrastructure-as-code, service-virtualization, environment-parity]
difficulty: advanced
estimated_time: 75 minutes
author: agentic-qe
---

# Test Environment Management

## Core Principle

**Unstable test environments = unreliable tests.**

Test environment management ensures consistent, reproducible environments for testing while optimizing cost and maintenance.

## Environment Types

### Local Development
```
Developer machine
- Fast feedback
- Full control
- May differ from production
```

### CI Environment
```
GitHub Actions, Jenkins, etc.
- Automated tests
- Ephemeral (created per build)
- Must match production closely
```

### Staging/QA Environment
```
Pre-production mirror
- Integration testing
- User acceptance testing
- Should match production exactly
```

### Production (Testing in Prod)
```
Real environment
- Canary deployments
- Feature flags
- Synthetic monitoring
```

## Docker for Test Environments

**Containerize test dependencies:**
```yaml
# docker-compose.test.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: test
      DATABASE_URL: postgres://postgres:password@db:5432/test
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: test
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

**Run tests in container:**
```bash
docker-compose -f docker-compose.test.yml up -d
docker-compose -f docker-compose.test.yml exec app npm test
docker-compose -f docker-compose.test.yml down
```

## Infrastructure as Code

**Terraform for test environments:**
```hcl
# test-environment.tf
resource "aws_instance" "test_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"

  tags = {
    Name        = "test-environment"
    Environment = "test"
    AutoShutdown = "20:00" # Cost optimization
  }
}

resource "aws_rds_instance" "test_db" {
  allocated_storage = 20
  engine           = "postgres"
  engine_version   = "15"
  instance_class   = "db.t3.micro"
  db_name          = "test"
  username         = "testuser"
  password         = var.db_password

  backup_retention_period = 0 # No backups needed for test
  skip_final_snapshot    = true
}
```

## Service Virtualization

**Mock external services:**
```javascript
// Use WireMock for API mocking
import { WireMock } from 'wiremock-captain';

const wiremock = new WireMock('http://localhost:8080');

// Mock payment gateway
await wiremock.register({
  request: {
    method: 'POST',
    url: '/charge'
  },
  response: {
    status: 200,
    jsonBody: {
      transactionId: '12345',
      status: 'approved'
    }
  }
});

// Tests use mock instead of real gateway
```

## Environment Parity

**Dev/Prod Parity Checklist:**
- [ ] Same OS and versions
- [ ] Same database type and version
- [ ] Same dependency versions
- [ ] Same configuration structure
- [ ] Same environment variables

**12-Factor App principles for parity**

## Cost Optimization

**Auto-shutdown test environments:**
```bash
# Shutdown test environments after hours
0 20 * * * aws ec2 stop-instances --instance-ids $(aws ec2 describe-instances --filters "Name=tag:Environment,Values=test" --query "Reservations[].Instances[].InstanceId" --output text)

# Start before work hours
0 7 * * 1-5 aws ec2 start-instances --instance-ids $(aws ec2 describe-instances --filters "Name=tag:Environment,Values=test" --query "Reservations[].Instances[].InstanceId" --output text)
```

**Use spot instances for test workloads:**
```hcl
resource "aws_instance" "test_runner" {
  instance_type        = "c5.2xlarge"
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price = "0.10" # Save 70% vs on-demand
    }
  }
}
```

## Related Skills

- [test-data-management](../test-data-management/)
- [continuous-testing-shift-left](../continuous-testing-shift-left/)
- [test-automation-strategy](../test-automation-strategy/)

## Remember

**Environment inconsistency = flaky tests.**

"Works on my machine" problems from:
- Different OS/versions
- Missing dependencies
- Configuration differences
- Data differences

**Infrastructure as Code ensures repeatability.**

**With Agents:** Agents automatically provision test environments, ensure parity with production, and optimize costs by auto-scaling and auto-shutdown.
