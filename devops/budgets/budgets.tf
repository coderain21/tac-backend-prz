 

provider "aws" {
  region = "eu-west-2"  # Change this to your desired region
}
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu" # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

resource "aws_budgets_budget" "budgets" {
  count   = 15
  name    = format("indyauction ${var.STAGE} Budget - $%d", 50 * (count.index + 1)) 
  limit_amount = 50 * (count.index + 1)
  limit_unit = "USD"
  budget_type = "COST"
  time_unit = "MONTHLY"
  provider = aws.deployment-eu
  notification {
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    comparison_operator = "GREATER_THAN"
    threshold = 90
    subscriber_email_addresses = ["namratha.shettigar@7edge.com", "ranjith.n@7edge.com"] 
  }
}





#limit_amount = 20 * (count.index + 1)
#name    = format("ARCM Budget-%d", 100 + 50 * (count.index + 1)) 