# Dependency Management Service

This service manages Lambda layers for IndyAuction backend APIs, replacing the previous Terraform-based dependency management.

## Overview

The service creates and manages the following Lambda layers:

1. **Node.js Common Layer** (`node-dependency-{stage}`)
   - Contains common Node.js dependencies used across services
   - Stored in SSM parameter: `COMMON_LIB_ARN`

2. **Python Main Layer** (`python-dependency-{stage}`)
   - Contains main Python dependencies
   - Stored in SSM parameter: `/COMMON_LIB_ARN_PYTHON`

3. **Python Secondary Layer** (`python-dependency-2-{stage}`)
   - Contains secondary Python dependencies (pandas, numpy)
   - Stored in SSM parameter: `/COMMON_LIB_ARN_PYTHON_2`

## Structure

```
dependency-management/
├── handlers/
│   └── deploy.js              # Dummy handler for layer deployment
├── layer/                     # Node.js layer directory
│   └── nodejs/
├── python_lib/                # Python main layer directory
│   └── python/
├── python_lib2/               # Python secondary layer directory
│   └── python/
├── extra/                     # Additional Python dependencies
├── package.json               # Node.js dependencies
├── requirements.txt           # Python main dependencies
├── requirements2.txt          # Python secondary dependencies
├── serverless.yml             # Serverless configuration
└── README.md                  # This file
```

## Dependencies

### Node.js Dependencies
- aws-sdk
- crypto-js
- dotenv
- joi
- mongodb
- mongoose
- redis
- stripe
- uuid
- axios
- mailchimp
- and more...

### Python Dependencies (Main)
- python-dateutil
- passlib
- pdfkit
- pymongo
- marshmallow
- cryptography
- PyJWT
- redis
- mailchimp
- paypal
- and more...

### Python Dependencies (Secondary)
- pandas
- numpy

## Usage

### Building Layers

```bash
# Build all layers
npm run build:all

# Build individual layers
npm run build:node      # Node.js layer
npm run build:python    # Python main layer
npm run build:python2   # Python secondary layer
```

### Deploying

```bash
# Deploy to specific stage
sls deploy --stage dev
sls deploy --stage qa
sls deploy --stage pre-production
sls deploy --stage prod
```

### Using Layers in Other Services

Reference the layers in your service's `serverless.yml`:

```yaml
provider:
  layers:
    - ${ssm:COMMON_LIB_ARN}           # Node.js layer
    - ${ssm:/COMMON_LIB_ARN_PYTHON}   # Python main layer
    - ${ssm:/COMMON_LIB_ARN_PYTHON_2} # Python secondary layer
```

## Migration from Terraform

This service replaces the following Terraform modules:
- `devops/dependency/node`
- `devops/dependency/python`

The `devops/dependency/nodejs-auth-layer` was removed as it's no longer needed.

## Deployment Order

This service must be deployed **before** all other services as they depend on the Lambda layers it creates. The deployment script `terraform_run.sh` has been updated to deploy this service first.
