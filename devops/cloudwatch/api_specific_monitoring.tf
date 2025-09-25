# API-Specific Monitoring with Priority Levels
# ===========================================
# This creates specific alarms for each API based on feature_api_mapping.txt priorities

# Variables
variable "api_gateway_name" {
  description = "Name of the API Gateway"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  type        = string
}

# P1 (Critical) API-Specific Alarms
# ==================================

# Authentication APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_verify_captcha_buyer_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-VerifyCaptcha-Buyer-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Buyer verify-captcha API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/buyers/verify-captcha"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Authentication"
    API         = "verify-captcha-buyer"
    AlertType   = "5xx-Errors"
  }
}

resource "aws_cloudwatch_metric_alarm" "p1_verify_captcha_seller_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-VerifyCaptcha-Seller-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Seller verify-captcha API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/users-management/verify-captcha"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Authentication"
    API         = "verify-captcha-seller"
    AlertType   = "5xx-Errors"
  }
}

# Bidding APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_bids_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-Bids-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Bidding API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/bids/"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Bidding"
    API         = "bids"
    AlertType   = "5xx-Errors"
  }
}

# Payment APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_payment_stripe_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-Payment-Stripe-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Stripe Payment API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "GET /v1/payments/stripe"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Payment"
    API         = "payment-stripe"
    AlertType   = "5xx-Errors"
  }
}

# Cart Management APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_cart_management_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-Cart-Management-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Cart Management API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/cart-management/cart"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Cart"
    API         = "cart-management"
    AlertType   = "5xx-Errors"
  }
}

# Credit Card Verification APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_credit_card_verify_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-CreditCard-Verify-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Credit Card Verification API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/buyers/verify-card"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Payment"
    API         = "credit-card-verify"
    AlertType   = "5xx-Errors"
  }
}

# Auction View APIs (P1)
resource "aws_cloudwatch_metric_alarm" "p1_auction_view_5xx" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-Auction-View-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "P1 CRITICAL - Auction View API 5xx errors detected. Immediate attention required."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "GET /v1/auctions/view"
  }

  tags = {
    Priority    = "P1"
    Severity    = "Critical"
    Environment = var.STAGE
    Service     = "Auction"
    API         = "auction-view"
    AlertType   = "5xx-Errors"
  }
}

# P2 (Medium) API-Specific Alarms
# ================================

# User Profile APIs (P2)
resource "aws_cloudwatch_metric_alarm" "p2_user_profile_5xx" {
  alarm_name          = "P2-IndyAuction-${var.STAGE}-User-Profile-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "P2 MEDIUM - User Profile API 5xx errors detected. Standard business hours resolution."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "PATCH /v1/buyers/profile"
  }

  tags = {
    Priority    = "P2"
    Severity    = "Medium"
    Environment = var.STAGE
    Service     = "UserManagement"
    API         = "user-profile"
    AlertType   = "5xx-Errors"
  }
}

# Address Management APIs (P2)
resource "aws_cloudwatch_metric_alarm" "p2_address_management_5xx" {
  alarm_name          = "P2-IndyAuction-${var.STAGE}-Address-Management-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "P2 MEDIUM - Address Management API 5xx errors detected. Standard business hours resolution."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/address-management/address"
  }

  tags = {
    Priority    = "P2"
    Severity    = "Medium"
    Environment = var.STAGE
    Service     = "AddressManagement"
    API         = "address-management"
    AlertType   = "5xx-Errors"
  }
}

# Order Management APIs (P2)
resource "aws_cloudwatch_metric_alarm" "p2_orders_5xx" {
  alarm_name          = "P2-IndyAuction-${var.STAGE}-Orders-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "P2 MEDIUM - Orders API 5xx errors detected. Standard business hours resolution."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "GET /v1/orders/"
  }

  tags = {
    Priority    = "P2"
    Severity    = "Medium"
    Environment = var.STAGE
    Service     = "OrderManagement"
    API         = "orders"
    AlertType   = "5xx-Errors"
  }
}

# P3 (Low) API-Specific Alarms
# =============================

# Search APIs (P3)
resource "aws_cloudwatch_metric_alarm" "p3_search_lots_5xx" {
  alarm_name          = "P3-IndyAuction-${var.STAGE}-Search-Lots-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "5"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "P3 LOW - Search Lots API 5xx errors detected. Can be scheduled for resolution."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "GET /v1/buyers/search-lots"
  }

  tags = {
    Priority    = "P3"
    Severity    = "Low"
    Environment = var.STAGE
    Service     = "Search"
    API         = "search-lots"
    AlertType   = "5xx-Errors"
  }
}

# Wishlist APIs (P3)
resource "aws_cloudwatch_metric_alarm" "p3_wishlist_5xx" {
  alarm_name          = "P3-IndyAuction-${var.STAGE}-Wishlist-5xx-Errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "5"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "P3 LOW - Wishlist API 5xx errors detected. Can be scheduled for resolution."
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
    Resource = "POST /v1/buyer-wishlist/"
  }

  tags = {
    Priority    = "P3"
    Severity    = "Low"
    Environment = var.STAGE
    Service     = "Wishlist"
    API         = "wishlist"
    AlertType   = "5xx-Errors"
  }
}
