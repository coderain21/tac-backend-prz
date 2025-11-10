"""Enhanced CloudWatch alarm handler for API and Lambda alerts."""
import boto3
import os
import json
import re

SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")

sns_client = boto3.client("sns")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
REGION = os.environ.get("AWS_REGION", "eu-west-2")


def publish_to_sns(lambda_name, route, log_link):
    subject = f"Alarm Log Details: {lambda_name}"
    message = (
        f"Lambda Function: {lambda_name}\n"
        f"Route: {route}\n"
        f"Log Stream: {log_link}"
    )
    response = sns_client.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=message
    )
    return response


# --- route mapping templates ---
route_to_lambda = {
    # Address Management
    ('address-management', 'POST', '/address'): 'address-management-{stage}-add_shipping_address',
    ('address-management', 'GET', '/address'): 'address-management-{stage}-view_address',
    ('address-management', 'PATCH', '/address'): 'address-management-{stage}-update_address',

    # Admin Buyer Bid Management

    ('admin-buyer-bid-history', '/admin/{buyer_id}'): 'admin-buyer-bid-history-{stage}-update',
    ('admin-buyer-bid-history', '/admin/buyer/{email_address}'): 'admin-buyer-bid-history-{stage}-list-bids',
    ('admin-buyer-bid-history', '/list/{seller_email}/{auction_id}'): 'admin-buyer-bid-history-{stage}-list',
    ('admin-buyer-bid-history', '/bids'): 'admin-buyer-bid-history-{stage}-bids',
    ('admin-buyer-bid-history', '/admin/lots'): 'admin-buyer-bid-history-{stage}-bid-info',
    ('admin-buyer-bid-history', '/delete-buyer'): 'admin-buyer-bid-history-{stage}-delete-buyer',

    # Admin Management
    ('admin-management', '/auctions'): 'admin-management-{stage}-list-auction',
    ('admin-management', '/buyers'): 'admin-management-{stage}-list-buyers',
    ('admin-management', '/buyer-details'): 'admin-management-{stage}-buyer-details',
    ('admin-management', '/buyer-auctions'): 'admin-management-{stage}-buyer-view-auction',
    ('admin-management', '/{id}'): 'admin-management-{stage}-purchase-list',
    ('admin-management', '/clone-auction'): 'admin-management-{stage}-clone_auction',
    ('admin-management', '/order-details'): 'admin-management-{stage}-order-details',
    ('admin-management', '/auction-purchases'): 'admin-management-{stage}-auction-purchases',
    ('admin-management', '/auction-details'): 'admin-management-{stage}-auction-details',
    ('admin-management', '/accountings'): 'admin-management-{stage}-all-purchases',
    ('admin-management', '/view-seller'): 'admin-management-{stage}-seller-view',
    ('admin-management', '/update-seller-status'): 'admin-management-{stage}-update-seller-status',
    ('admin-management', '/unpublish-auction'): 'admin-management-{stage}-unpublish_auction',
    ('admin-management', '/edit-auction/{auction_id}'): 'admin-management-{stage}-update',
    ('admin-management', '/publish-auction/{auction_id}'): 'admin-management-{stage}-publish_auction',
    ('admin-management', '/admin-subdomain'): 'admin-management-{stage}-admin-sub-domain',
    ('admin-management', '/edit-auction/{auction_id}'): 'admin-management-{stage}-update_auction',
    ('admin-management', '/update-lot'): 'admin-management-{stage}-admin_update_lot',
    ('admin-management', '/all-sellers'): 'admin-management-{stage}-list-all-sellers',
    ('admin-management', '/admin-update-password'): 'admin-management-{stage}-admin_update_password',
    ('admin-management', '/enable-disable-seller'): 'admin-management-{stage}-enable_disable_seller',
    ('admin-management', '/update-seller-settings'): 'admin-management-{stage}-update-seller-settings',


    # Auctions
    ('auctions', 'POST', '/'): 'auctions-{stage}-create',
    ('auctions', 'GET', '/'): 'auctions-{stage}-list_auction',
    ('auctions', '/lots'): 'auctions-{stage}-create_lots',
    ('auctions', '/view'): 'auctions-{stage}-view',
    ('auctions', '/{auction_id}'): 'auctions-{stage}-unpublish_auction',
    ('auctions', '/update/{auction_id}'): 'auctions-{stage}-update_auction',
    ('auctions', '/clone'): 'auctions-{stage}-clone_auction',
    ('auctions', '/import'): 'auctions-{stage}-import_lots',
    ('auctions', 'PATCH', '/'): 'auctions-{stage}-delete_note',
    ('auctions', 'POST', '/lots'): 'auctions-{stage}-create_lots',
    ('auctions', 'GET', '/lots'): 'auctions-{stage}-list_lots',
    ('auctions', '/admin/lots'): 'auctions-{stage}-admin_list_lots',
    ('auctions', 'DELETE', '/lots'): 'auctions-{stage}-delete_lot',
    ('auctions', 'PATCH', '/lots'): 'auctions-{stage}-update_lot',
    ('auctions', '/update/{auction_id}'): 'auctions-{stage}-update_auction',
    ('auctions', '/{auction_id}'): 'auctions-{stage}-delete_auction',
    ('auctions', '/deactivate'): 'auctions-{stage}-deactivate',
    ('auctions', '/leaderboard/{auction_id}'): 'auctions-{stage}-get-leaderboard',
    ('auctions', '/image'): 'auctions-{stage}-delete-image',


    # Bids
    ('bids', '/update'): 'bids-{stage}-add-to-group',
    ('bids', '/{id}'): 'bids-{stage}-view',
    ('bids', 'GET', '/'): 'bids-{stage}-list',
    ('bids', '/admin/{id}'): 'bids-{stage}-admin-view',

    # Buyer Wishlist
    ('buyer-wishlist', '/'): 'buyer-wishlist-{stage}-create',
    ('buyer-wishlist', '/remove'): 'buyer-wishlist-{stage}-remove_wishlist',
    ('buyer-wishlist', '/wishlist'): 'buyer-wishlist-{stage}-wishlist-listing',

    # Buyers
    ('buyers', '/verify-captcha'): 'buyers-{stage}-verify-recaptha',
    ('buyers', '/otp-validation'): 'buyers-{stage}-otp-validation',
    ('buyers', '/update-password'): 'buyers-{stage}-update_password',
    ('buyers', '/forgot_password'): 'buyers-{stage}-send-reset-link',
    ('buyers', '/reset_password'): 'buyers-{stage}-update-new-password',
    ('buyers', '/profile'): 'buyers-{stage}-view_profile',
    ('buyers', '/view-lots'): 'buyers-{stage}-view_lots',
    ('buyers', '/lot-details'): 'buyers-{stage}-view_lot_details',
    ('buyers', '/auction-register'): 'buyers-{stage}-auction_register',
    ('buyers', '/view'): 'buyers-{stage}-view',
    ('buyers', '/paddle'): 'buyers-{stage}-paddle_number',
    ('buyers', '/search-lots'): 'buyers-{stage}-search_lots',
    ('buyers', '/approval'): 'buyers-{stage}-acceting_buyer',
    ('buyers', '/verify-card'): 'buyers-{stage}-credit_card',
    ('buyers', '/'): 'buyers-{stage}-create_userpools',
    ('buyers', '/add-address'): 'buyers-{stage}-add_address',
    ('buyers', '/links'): 'buyers-{stage}-footer-links',
    ('buyers', '/buyer-logs'): 'buyers-{stage}-buyer-signin-logger',
    ('buyers', '/policy/{auction_id}'): 'buyers-{stage}-view-privacy-policy',

    # Cart Management
    ('cart-management', '/cart'): 'cart-management-{stage}-view_cart',

    # Lot Bid History
    ('lot-bid-history', '/{lot_id}'): 'lot-bid-history-{stage}-list-bids',
    ('lot-bid-history', '/buyer/{lot_id}'): 'lot-bid-history-{stage}-buyer-list-bids',
    ('lot-bid-history', '/auction/{auction_id}'): 'lot-bid-history-{stage}-auction-bid-list',
    ('lot-bid-history', '/seller/bids'): 'lot-bid-history-{stage}-bid-listing',

    # newsletter
    ('newsletter', '/'): 'newsletter-{stage}-update',

    # Orders
    ('orders', '/'): 'orders-{stage}-list_orders',
    ('orders', '/details'): 'orders-{stage}-order_detail',
    ('orders', '/update'): 'orders-{stage}-order_update',
    ('orders', '/sales'): 'orders-{stage}-sales_details',
    ('orders', '/seller'): 'orders-{stage}-seller_list_orders',

    # Payments
    ('payments', '/stripe'): 'payments-{stage}-create_intent',
    ('payments', '/payments_webhook'): 'payments-{stage}-stripe_payments_webhook',

    # PayPal
    ('paypal', '/paypal-order'): 'paypal-{stage}-create-order',
    ('paypal', '/capture-order'): 'paypal-{stage}-paypal-capture-order',
    ('paypal', '/paypal-connect'): 'paypal-{stage}-paypal-paypal_connect',
    ('paypal', '/paypal-connect-webhook'): 'paypal-{stage}-paypal_connect_webhook',
    ('paypal', '/paypal-disconnect'): 'paypal-{stage}-paypal-paypal-disconnect',
    ('paypal', '/paypal-order-webhook'): 'paypal-{stage}-paypal-paypal-order-webhook',

    # Quicksight

    ('quicksight-dashboards', '/'): 'quicksight-dashboards-{stage}-view',
    ('quicksight-dashboards', '/auction-view'): 'quicksight-dashboards-{stage}-auction-view',
    ('quicksight-dashboards', '/admin-view'): 'quicksight-dashboards-{stage}-admin-view',
    ('quicksight-dashboards', '/admin-auction-view'): 'quicksight-dashboards-{stage}-admin-auction-view',

    # seller bidder management
    ('seller-bidder-management', '/'): 'seller-bidder-management-{stage}-view',
    ('seller-bidder-management', '/seller-orders'): 'seller-bidder-management-{stage}-seller-orders',

    # Site Banner
    ('site-banner', 'POST', '/'): 'site-banner-{stage}-create',
    ('site-banner', 'GET', '/'): 'site-banner-{stage}-list',
    ('site-banner', '/{audience}'): 'site-banner-{stage}-view',
    ('site-banner', '/delete/{notification_id}'): 'site-banner-{stage}-delete',

    # Subdomain
    ('subdomain', '/subdomain'): 'subdomain-{stage}-sub-domain',

    # Users Management
    ('users-management', '/password-update/{email}'): 'users-management-{stage}-update-password',
    ('users-management', '/verify-captcha'): 'users-management-{stage}-verify-recaptha',
    ('users-management', '/otp-validation'): 'users-management-{stage}-otp-validation',
    ('users-management', '/forgot_password'): 'users-management-{stage}-send-reset-link',
    ('users-management', '/reset_password'): 'users-management-{stage}-update-new-password',
    ('users-management', '/request-otp'): 'users-management-{stage}-request-otp',
    ('users-management', 'GET', '/{email}'): 'users-management-{stage}-view-profile',
    ('users-management', 'PATCH', '/{email}'): 'users-management-{stage}-update-profile',
    ('users-management', '/update-plan/{email}'): 'users-management-{stage}-update-plans',
    ('users-management', '/payment-intent'): 'users-management-{stage}-split_payment',
    ('users-management', '/seller-sub-domain'): 'users-management-{stage}-seller_sub_domain',
    ('users-management', 'PATCH', '/stripe'): 'users-management-{stage}-disconnect_account',
    ('users-management', 'GET', '/stripe'): 'users-management-{stage}-stripe-connect',
    ('users-management', '/stripe_webhook_trigger'): 'users-management-{stage}-stripe-webhook',
    ('users-management', '/create-template'): 'users-management-{stage}-users-management-{stage}-create-mailchimp-template',
    ('users-management', '/generate'): 'users-management-{stage}-users-management-{stage}-generate_token',
    ('users-management', '/auth/login'): 'users-management-{stage}-users-management-{stage}-subdomain-callback',
    ('users-management', '/get-template/{template_name}'): 'users-management-{stage}-users-management-{stage}-get-mailchimp-template',
}
LAMBDA_ALARM_MAP = {
    "P1-IndyAuction-{stage}-Process Cart Logs Error Alarm": "auctions-{stage}-process-cart",
    "P1-IndyAuction-{stage}-Save-To-Cache-Logs-Error-Alarm": "auctions-{stage}-save-to-cache",
    "P1-IndyAuction-{stage}-Batch-Lots-Publish-Error-Alarm": "auctions-{stage}-batchLotsPublish",
    "P1-IndyAuction-{stage}-Batch-Lots-Update-Error-Alarm": "auctions-{stage}-batchLotsUpdate",
    "P3-IndyAuction-{stage}-Auction-Cleanup-Error-Alarm": "auctions-{stage}-auction-cleanup",
    "P1-IndyAuction-{stage}-Cleanup-Step-Functions-Error-Alarm": "auctions{stage}-cleanupStepFunctions",
    "P1-IndyAuction{stage}-Cognito-Pre-Auth-Error-Alarm": "cognito{stage}-pre-auth",
    "P1-IndyAuction{stage}-Cognito-Post-Auth-Error-Alarm": "cognito{stage}-post-auth",
    "P2-IndyAuction{stage}-Admin-Pre-Signup-Error-Alarm": "cognito{stage}-admin-pre-signup"}

# --- supported environment names ---
STAGES = ['dev', 'qa', 'prod', 'pre-production', 'bidding-engine']

# --- helper functions ---


def get_alarm_priority(alarm_name):
    """Extract priority from alarm name based on alarms.tf naming convention"""
    if alarm_name.startswith('P1-IndyAuction'):
        return 'P1'
    elif alarm_name.startswith('P2-IndyAuction'):
        return 'P2'
    elif alarm_name.startswith('P3-IndyAuction'):
        return 'P3'
    elif 'p1-' in alarm_name.lower():
        return 'P1'
    return 'P1'  # Default to P1 for safety


def publish_to_sns(lambda_name, route, log_link, alarm_name=""):
    priority = get_alarm_priority(alarm_name)
    priority_emoji = {'P1': '🔴', 'P2': '🟡', 'P3': '🟢'}.get(priority, '🔴')
    subject = f"{priority_emoji} {priority} Alarm: {lambda_name}"
    message = (
        f"Priority: {priority}\n"
        f"Lambda Function: {lambda_name}\n"
        f"Route: {route}\n"
        f"Log Stream: {log_link}"
    )
    sns_client.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=message
    )


def parse_alarm_name(alarm_name):
    parts = alarm_name.split('-')
    stage = next((p for p in parts if p in STAGES), None)
    if not stage:
        raise ValueError(f"No valid stage found in alarm name: {alarm_name}")
    start_index = parts.index("IndyAuction") + 1
    stage_index = parts.index(stage)
    service = '-'.join(parts[start_index:stage_index])
    resource = '/' + '-'.join(parts[stage_index + 1:])
    if resource.endswith('-email'):
        resource = resource.replace('-email', '/{email}')
    return service, stage, resource


def get_lambda_name(api_service, api_path=None, method=None, stage=None):
    if stage is None:
        stage = os.environ.get('STAGE', 'dev')
    # Handle old-style calls that pass (service, stage, resource)
    if api_path == stage and method is None:
        # probably called like get_lambda_name(service, stage, resource)
        api_path = method  # swap meaning if args were shifted
        method = None

    # Try exact 3-key match first
    key_with_method = (api_service, method, api_path)
    if key_with_method in route_to_lambda:
        return route_to_lambda[key_with_method].format(stage=stage)

    # Fallback to 2-key exact match
    key_without_method = (api_service, api_path)
    if key_without_method in route_to_lambda:
        return route_to_lambda[key_without_method].format(stage=stage)

    # Fuzzy match if parameters have placeholders like {id}
    for (svc, *rest), name in route_to_lambda.items():
        if svc == api_service:
            path_pattern = rest[-1] if rest else ""
            # Replace {param} placeholders with wildcards
            regex_pattern = re.sub(r"\{[^/]+\}", r"[^/]+", path_pattern)
            if re.fullmatch(regex_pattern, api_path):
                return name.format(stage=stage)

    return None


def get_latest_log_stream_link(lambda_name):
    logs = boto3.client("logs", region_name=REGION)
    log_group = f"/aws/lambda/{lambda_name}"
    response = logs.describe_log_streams(
        logGroupName=log_group,
        orderBy="LastEventTime",
        descending=True,
        limit=1
    )
    streams = response.get("logStreams", [])
    if not streams:
        return f"No logs found for {lambda_name}"
    latest_stream = streams[0]["logStreamName"]
    encoded_group = log_group.replace('/', '$252F')
    encoded_stream = (
        latest_stream.replace('$', '$2524')
        .replace('/', '$252F')
        .replace('[', '$255B')
        .replace(']', '$255D')
    )
    return (
        f"https://console.aws.amazon.com/cloudwatch/home?region={REGION}"
        f"#logsV2:log-groups/log-group/{encoded_group}/log-events/{encoded_stream}"
    )

# --- main entry point ---


def lambda_handler(event, context):
    print("Incoming event:", json.dumps(event))

    try:
        for record in event['Records']:
            sns_message = record['Sns']['Message']
            message_data = json.loads(sns_message) if sns_message.strip(
            ).startswith('{') else {'AlarmName': sns_message}
            alarm_name = message_data.get('AlarmName')

            if not alarm_name:
                print("AlarmName not found in SNS message.")
                continue

            print(f"Processing alarm: {alarm_name}")

            # 1️⃣ Direct mapping first
            if alarm_name in LAMBDA_ALARM_MAP:
                lambda_name = LAMBDA_ALARM_MAP[alarm_name]
                route = "N/A"
            else:
                # 2️⃣ Parse and map from route
                service, stage, resource = parse_alarm_name(alarm_name)
                lambda_name = get_lambda_name(
                    service, resource, method=None, stage=stage)
                print(
                    lambda_name,
                    "lambda_namelambda_namelambda_namelambda_name")
                route = resource

            if not lambda_name:
                print(f"No Lambda mapping found for alarm: {alarm_name}")
                continue

            log_link = get_latest_log_stream_link(lambda_name)
            publish_to_sns(lambda_name, route, log_link, alarm_name)
            print(f"✅ Sent SNS notification for {lambda_name}")

        return {"status": "success"}
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error", "details": str(e)}
