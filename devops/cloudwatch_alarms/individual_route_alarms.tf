# Individual Route Alarms for Critical API Endpoints
# This provides exact route identification without composite alarm guessing

locals {
  # ALL 124 routes extracted from your current alarms.tf
  all_routes = [
    # P1 Critical - Authentication & Registration
    { service = "buyers", resource = "/verify-captcha", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/otp-validation", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/auth/login", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/verify-captcha", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/otp-validation", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/request-otp", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/auction-register", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/verify-card", method = "POST", priority = "P1" },
    { service = "subdomain", resource = "/subdomain", method = "GET", priority = "P1" },
    { service = "subdomain", resource = "/subdomain", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/password-update/{email}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Payments & Bidding
    { service = "bids", resource = "/update", method = "PATCH", priority = "P1" },
    { service = "payments", resource = "/stripe", method = "GET", priority = "P1" },
    { service = "paypal", resource = "/paypal-order", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/capture-order", method = "GET", priority = "P1" },
    { service = "cart-management", resource = "/cart", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/lots", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/update/{auction_id}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Viewing & Management
    { service = "buyers", resource = "/view", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/view-lots", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/lot-details", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/paddle", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/view", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/{auction_id}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 1
    { service = "auctions", resource = "/", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/", method = "PATCH", priority = "P1" },
    { service = "auctions", resource = "/lots", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/admin/lots", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/reorder-lots", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/{auction_id}", method = "DELETE", priority = "P1" },
    { service = "auctions", resource = "/deactivate", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/leaderboard/{auction_id}", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 2
    { service = "auctions", resource = "/image", method = "DELETE", priority = "P1" },
    { service = "buyers", resource = "/", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/add-address", method = "PATCH", priority = "P1" },
    { service = "buyers", resource = "/links", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/buyer-logs", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/policy/{auction_id}", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/search-lots", method = "GET", priority = "P1" },
    { service = "buyer-wishlist", resource = "/", method = "POST", priority = "P1" },
    { service = "buyer-wishlist", resource = "/remove", method = "DELETE", priority = "P1" },
    
    # P1 Critical - Additional Routes 3
    { service = "buyer-wishlist", resource = "/wishlist", method = "GET", priority = "P1" },
    { service = "address-management", resource = "/address", method = "GET", priority = "P1" },
    { service = "address-management", resource = "/address", method = "PATCH", priority = "P1" },
    { service = "bids", resource = "/", method = "GET", priority = "P1" },
    { service = "bids", resource = "/{id}", method = "GET", priority = "P1" },
    { service = "bids", resource = "/admin/{id}", method = "GET", priority = "P1" },
    { service = "payments", resource = "/payments_webhook", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/paypal-connect", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 4
    { service = "paypal", resource = "/paypal-connect-webhook", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/paypal-disconnect", method = "PATCH", priority = "P1" },
    { service = "paypal", resource = "/paypal-order-webhook", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/{email}", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/{email}", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/generate", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/update-plan/{email}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 5
    { service = "users-management", resource = "/payment-intent", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/seller-sub-domain", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/stripe", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/stripe", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/stripe_webhook_trigger", method = "ANY", priority = "P1" },
    { service = "users-management", resource = "/get-template/{template_name}", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/create-template", method = "POST", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/admin/{buyer_id}", method = "PATCH", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/admin/buyer/{email_address}", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 6
    { service = "admin-buyer-bid-history", resource = "/list/{seller_email}/{auction_id}", method = "GET", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/bids", method = "GET", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/delete-buyer", method = "DELETE", priority = "P1" },
    { service = "seller-bidder-management", resource = "/", method = "GET", priority = "P1" },
    { service = "seller-bidder-management", resource = "/seller-orders", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/{lot_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/buyer/{lot_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/auction/{auction_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/seller/bids", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 7
    { service = "orders", resource = "/", method = "GET", priority = "P1" },
    { service = "orders", resource = "/details", method = "GET", priority = "P1" },
    { service = "orders", resource = "/update", method = "PUT", priority = "P1" },
    { service = "orders", resource = "/sales", method = "GET", priority = "P1" },
    { service = "orders", resource = "/seller", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/", method = "POST", priority = "P1" },
    { service = "site-banner", resource = "/", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/{audience}", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/delete/{notification_id}", method = "DELETE", priority = "P1" },
    
    # P1 Critical - Additional Routes 8
    { service = "admin-management", resource = "/auctions", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyers", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyer-details", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyer-auctions", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/{id}", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/clone-auction", method = "POST", priority = "P1" },
    { service = "admin-management", resource = "/order-details", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/auction-purchases", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/auction-details", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 9
    { service = "admin-management", resource = "/accountings", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/view-seller", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/update-seller-status", method = "POST", priority = "P1" },
    { service = "admin-management", resource = "/unpublish-auction", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/admin_bdd-update/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/publish-auction/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/admin-subdomain", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/edit-auction/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/update-lot", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 10
    { service = "admin-management", resource = "/all-sellers", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/admin-update-password", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/enable-disable-seller", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/update-seller-settings", method = "PATCH", priority = "P1" },
    { service = "newsletter", resource = "/", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Missing Services
    { service = "quicksight-dashboards", resource = "/", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/auction-view", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/admin-view", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/admin-auction-view", method = "GET", priority = "P1" },
    
    # P2 Medium - Profile Management
    { service = "buyers", resource = "/update-password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/forgot_password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/reset_password", method = "POST", priority = "P2" },
    { service = "users-management", resource = "/forgot_password", method = "POST", priority = "P2" },
    { service = "users-management", resource = "/reset_password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/profile", method = "PATCH", priority = "P2" },
    { service = "address-management", resource = "/address", method = "POST", priority = "P2" },
    
    # P2 Medium - Auction Management
    { service = "auctions", resource = "/clone", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/approval", method = "PATCH", priority = "P2" },
    { service = "auctions", resource = "/lots", method = "PATCH", priority = "P2" },
    { service = "auctions", resource = "/lots", method = "DELETE", priority = "P2" },
    { service = "auctions", resource = "/import", method = "POST", priority = "P2" },
    
    # P3 Low - Search & Other
    { service = "order-management", resource = "/orders", method = "GET", priority = "P3" }
  ]
  
  # Threshold mapping by priority
  thresholds = {
    P1 = 1  # Immediate alert for critical routes
    P2 = 3  # Alert after 3 errors for medium priority
    P3 = 5  # Alert after 5 errors for low priority
  }
  
  # P1 Critical routes
  p1_routes = [for route in local.all_routes : route if route.priority == "P1"]
  
  # P2 Medium routes
  p2_routes = [for route in local.all_routes : route if route.priority == "P2"]
  
  # P3 Low routes
  p3_routes = [for route in local.all_routes : route if route.priority == "P3"]
}

# P1 Critical alarms
resource "aws_cloudwatch_metric_alarm" "p1_alarms" {
  for_each = { for route in local.p1_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P1-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "P1 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P1"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}

# P2 Medium alarms
resource "aws_cloudwatch_metric_alarm" "p2_alarms" {
  for_each = { for route in local.p2_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P2-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 3
  alarm_description   = "P2 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P2"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}

# P3 Low alarms
resource "aws_cloudwatch_metric_alarm" "p3_alarms" {
  for_each = { for route in local.p3_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P3-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 5
  alarm_description   = "P3 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P3"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}








# Output summary of created alarms
output "individual_route_alarms_summary" {
  value = {
    total_individual_alarms = length(local.all_routes)
    error_rate_alarms      = length([for route in local.all_routes : route if route.priority == "P1"])
    p1_routes             = length([for route in local.all_routes : route if route.priority == "P1"])
    p2_routes             = length([for route in local.all_routes : route if route.priority == "P2"])
    p3_routes             = length([for route in local.all_routes : route if route.priority == "P3"])
  }
}