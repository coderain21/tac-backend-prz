# Configure the AWS Cloud Control API (CCAPI) provider for Application Signals
provider "awscc" {
  region  = "ap-south-1" # Set region based on your main.tf
  profile = "ador-${var.STAGE}" # Use the same profile as your aws provider
  alias   = "deployment-ap-cc" # Optional: Alias if needed, aligns with aws provider alias convention
}

variable "STAGE" {
  description = "Deployment stage (e.g., prod)"
  type        = string
  # Default or read from tfvars
}

variable "REGION" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1"
}

terraform {
  backend "s3" {
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

# --- Web Application SLOs (Using RUM data) ---

# == ADOR Admin Web Application ==

# 1. Admin Web App Availability (based on RUM Http5xx Error Rate per Session <= 5%)
resource "awscc_applicationsignals_service_level_objective" "admin_web_availability" {
  provider    = awscc.deployment-ap-cc # Specify the CCAPI provider alias
  name        = "AdorProd-AdminWeb-Availability-95pc-7d"
  description = "Admin Web App target: RUM Http5xx Error Rate per Session <= 5% (equiv. >= 95% Availability), measured over rolling 7 days."

  sli = {
    comparison_operator = "LessThanOrEqualTo" # Error Rate should be LESS THAN OR EQUAL TO 5%
    metric_threshold    = 0.05 # 5% represented as a decimal

    sli_metric = {
      metric_data_queries = [
        { id = "errorRate", expression = "FILL(m5xx, 0) / FILL(mSessions, 1)", return_data = true, label = "Http5xxErrorRatePerSession" },
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/RUM", metric_name = "Http5xxCount", dimensions = [{ name = "application_name", value = "ADOR-Admin-Web-Application" }] }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mSessions", metric_stat = { metric = { namespace = "AWS/RUM", metric_name = "SessionCount", dimensions = [{ name = "application_name", value = "ADOR-Admin-Web-Application" }] }, period = 300, stat = "Sum" }, return_data = false }
      ]
    }
  }

  goal = {
    attainment_goal = 99.0
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 }, # 3 hours
    { look_back_window_minutes = 1440 }, # 24 hours
  ]
  tags = [ { key = "Application", value = "AdminWebApp" }, { key = "SLOType", value = "Availability" }, { key = "Stage", value = var.STAGE } ]
}

# 2. Admin Web App Latency (<= 10 seconds) - UPDATED
resource "awscc_applicationsignals_service_level_objective" "admin_web_latency" {
  provider    = awscc.deployment-ap-cc
  name        = "AdorProd-AdminWeb-Latency-P90-Under10s-7d" # UPDATED name
  description = "Admin Web App p90 Page Load Time (PerformanceNavigationDuration) <= 10000ms. Goal: 99.9% intervals ok over 7d." # UPDATED description

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 10000 # UPDATED: 10 seconds in milliseconds
    sli_metric = {
      metric_data_queries = [{
        id = "p90pageload"
        metric_stat = {
          metric = { namespace = "AWS/RUM", metric_name = "PerformanceNavigationDuration", dimensions = [{ name = "application_name", value = "ADOR-Admin-Web-Application" }] },
          period = 300,
          stat   = "p90"
        }
        return_data = true
      }]
    }
  }
  goal = {
    attainment_goal = 99.9 # Assumed attainment for latency threshold
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [ { key = "Application", value = "AdminWebApp" }, { key = "SLOType", value = "Latency" }, { key = "Stage", value = var.STAGE } ]
}


# == ADOR Distributor Web Application ==

# 3. Distributor Web App Availability (based on RUM Http5xx Error Rate per Session <= 5%) - Corrected
resource "awscc_applicationsignals_service_level_objective" "distributor_web_availability" {
  provider    = awscc.deployment-ap-cc
  name        = "AdorProd-DistributorWeb-Availability-95pc-7d"
  description = "Distributor Web App target: RUM Http5xx Error Rate per Session <= 5% (equiv. >= 95% Availability), measured over rolling 7 days."

  sli = {
    comparison_operator = "LessThanOrEqualTo" # Error Rate should be LESS THAN OR EQUAL TO 5%
    metric_threshold    = 0.05 # 5% represented as a decimal

    sli_metric = {
      metric_data_queries = [
        { id = "errorRate", expression = "FILL(m5xx, 0) / FILL(mSessions, 1)", return_data = true, label = "Http5xxErrorRatePerSession" },
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/RUM", metric_name = "Http5xxCount", dimensions = [{ name = "application_name", value = "ADOR-Distributor-Web-Application" }] }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mSessions", metric_stat = { metric = { namespace = "AWS/RUM", metric_name = "SessionCount", dimensions = [{ name = "application_name", value = "ADOR-Distributor-Web-Application" }] }, period = 300, stat = "Sum" }, return_data = false }
      ]
    }
  }
  goal = {
    attainment_goal = 99.0
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [ { key = "Application", value = "DistributorWebApp" }, { key = "SLOType", value = "Availability" }, { key = "Stage", value = var.STAGE } ]
}

# 4. Distributor Web App Latency (<= 10 seconds) - UPDATED
resource "awscc_applicationsignals_service_level_objective" "distributor_web_latency" {
  provider    = awscc.deployment-ap-cc
  name        = "AdorProd-DistributorWeb-Latency-P90-Under10s-7d" # UPDATED name
  description = "Distributor Web App p90 Page Load Time (PerformanceNavigationDuration) <= 10000ms. Goal: 99.9% intervals ok over 7d." # UPDATED description

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 10000 # UPDATED: 10 seconds in milliseconds
    sli_metric = {
      metric_data_queries = [{
        id = "p90pageload"
        metric_stat = {
          metric = { namespace = "AWS/RUM", metric_name = "PerformanceNavigationDuration", dimensions = [{ name = "application_name", value = "ADOR-Distributor-Web-Application" }] },
          period = 300,
          stat   = "p90"
        }
        return_data = true
      }]
    }
  }
  goal = {
    attainment_goal = 99.9 # Assumed attainment for latency threshold
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [ { key = "Application", value = "DistributorWebApp" }, { key = "SLOType", value = "Latency" }, { key = "Stage", value = var.STAGE } ]
}

# --- API Gateway SLOs (Aggregated across ALL APIs in 'prod' stage) ---

# 5. API Response Time (<= 3 seconds) - No changes needed here
resource "awscc_applicationsignals_service_level_objective" "api_latency" {
  provider    = awscc.deployment-ap-cc
  name        = "AdorProd-APIGateway-Aggregate-Latency-P90-Under3s-7d"
  description = "Aggregate API Gateway (prod stage) p90 latency <= 3000ms. Goal: 99.9% intervals ok over 7d."

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 3000 # 3 seconds in milliseconds
    sli_metric = {
      metric_data_queries = [{
        id = "apip90latency_agg"
        metric_stat = {
          metric = {
            namespace   = "AWS/ApiGateway"
            metric_name = "Latency"
            dimensions  = [{ name = "Stage", value = "prod" }] # Aggregating by Stage
          }
          period = 300
          stat   = "p90"
        }
        return_data = true
      }]
    }
  }
  goal = {
    attainment_goal = 99.9 # Assumed attainment
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [ { key = "Application", value = "APIGatewayAggregate" }, { key = "SLOType", value = "Latency" }, { key = "Stage", value = var.STAGE } ]
}

# Note: SLOs for Lambda errors, EC2, RDS, DynamoDB are not created as they don't directly map to the image's user-facing SLOs.
# Note: Process metrics (Service Requests, Incident Handling) are excluded.
# Note: Mobile App SLOs are excluded as requested.
# Note: Months 7+ SLO definitions have been removed.