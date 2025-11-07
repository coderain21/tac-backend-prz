import boto3
import os
import json
import re

# --- route mapping templates ---
route_to_lambda = {
        # Users Management
        ('users-management', '/password-update/{email}'): 'users-management-{stage}-update_password',
        ('users-management', '/verify-captcha'): 'users-management-{stage}-verify-recaptha',
        ('users-management', '/otp-validation'): 'users-management-{stage}-otp-validation',
        ('users-management', '/forgot_password'): 'users-management-{stage}-send-reset-link',
        ('users-management', '/reset_password'): 'users-management-{stage}-update-new-password',
        ('users-management', '/auth/login'): 'users-management-{stage}-generate_token',
        ('users-management', '/request-otp'): 'users-management-{stage}-request-otp',
        ('users-management', '/{email}'): 'users-management-{stage}-view-profile',
        
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
        
        # Subdomain
        ('subdomain', '/subdomain'): 'subdomain-{stage}-sub-domain',
        
        # Bids
        ('bids', '/update'): 'bids-{stage}-add-to-group',
        ('bids', '/'): 'bids-{stage}-view',
        
        # Payments
        ('payments', '/stripe'): 'payments-{stage}-create_intent',
        
        # PayPal
        ('paypal', '/paypal-order'): 'paypal-{stage}-create-order',
        ('paypal', '/capture-order'): 'paypal-{stage}-paypal-capture-order',
        
        # Cart Management
        ('cart-management', '/cart'): 'cart-management-{stage}-view_cart',
        
        # Auctions
        ('auctions', '/'): 'auctions-{stage}-create',
        ('auctions', '/lots'): 'auctions-{stage}-create_lots',
        ('auctions', '/view'): 'auctions-{stage}-view',
        ('auctions', '/{auction_id}'): 'auctions-{stage}-unpublish_auction',
        ('auctions', '/update/{auction_id}'): 'auctions-{stage}-update_auction',
        ('auctions', '/clone'): 'auctions-{stage}-clone_auction',
        ('auctions', '/import'): 'auctions-{stage}-import_lots',
        ('auctions', '/process-cart'): 'auctions-{stage}-process-cart',
        ('auctions', '/save-to-cache'): 'auctions-{stage}-save-to-cache',
        
        # Address Management
        ('address-management', '/address'): 'address-management-{stage}-add_shipping_address',
        
        # Buyer Wishlist
        ('buyer-wishlist', '/'): 'buyer-wishlist-{stage}-create',
        ('buyer-wishlist', '/remove'): 'buyer-wishlist-{stage}-remove_wishlist',
        ('buyer-wishlist', '/wishlist'): 'buyer-wishlist-{stage}-wishlist-listing',
        
        # Orders
        ('orders', '/'): 'orders-{stage}-view_orders',
        ('orders', '/details'): 'orders-{stage}-order_details',
        ('orders', '/update'): 'orders-{stage}-update_order',
        ('orders', '/sales'): 'orders-{stage}-sales',
        ('orders', '/seller'): 'orders-{stage}-seller_list_orders'
    }

# --- supported environment names ---
STAGES = ['dev', 'qa', 'prod', 'pre-production', 'bidding-engine']


def parse_alarm_name(alarm_name):
    """
    Parse CloudWatch alarm name to extract service, stage, and resource.
    Example:
        P1-IndyAuction-users-management-dev-password-update-email
    """
    parts = alarm_name.split('-')
    stage = next((p for p in parts if p in STAGES), None)
    if not stage:
        raise ValueError(f"No valid stage found in alarm name: {alarm_name}")

    try:
        start_index = parts.index("IndyAuction") + 1
        stage_index = parts.index(stage)
        service = '-'.join(parts[start_index:stage_index])
    except ValueError:
        raise ValueError(f"Unexpected format for alarm name: {alarm_name}")

    resource_parts = parts[stage_index + 1:]
    resource = '/' + '-'.join(resource_parts)

    if resource.endswith('-email'):
        resource = resource.replace('-email', '/{email}')

    return service, stage, resource


def get_lambda_name(service, stage, resource):
    key = (service, resource)
    if key in route_to_lambda:
        return route_to_lambda[key].format(stage=stage)

    # fallback partial match
    for (svc, path), name in route_to_lambda.items():
        if svc == service and path.replace('{email}', 'email').replace('-', '') in resource.replace('-', ''):
            return name.format(stage=stage)
    return None


def get_latest_log_stream_link(lambda_name):
    region = os.environ.get("AWS_REGION", "eu-west-2")
    client = boto3.client("logs", region_name=region)
    log_group = f"/aws/lambda/{lambda_name}"

    try:
        response = client.describe_log_streams(
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
        return f"https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{encoded_group}/log-events/{latest_stream}"
    except Exception as e:
        return str(e)


def get_log_stream_from_alarm(alarm_name):
    try:
        service, stage, resource = parse_alarm_name(alarm_name)
        lambda_name = get_lambda_name(service, stage, resource)
        
        if not lambda_name:
            return f"No matching Lambda found for alarm: {alarm_name}"
        return get_latest_log_stream_link(lambda_name)
    except Exception as e:
        return str(e)


def lambda_handler(event, context):
    """
    Lambda triggered by SNS when a CloudWatch Alarm fires.
    SNS message contains the alarm name.
    """
    print("Incoming event:", json.dumps(event))

    try:
        # SNS sends a 'Records' array
        for record in event['Records']:
            sns_message = record['Sns']['Message']
            message_data = json.loads(sns_message) if sns_message.strip().startswith('{') else {'AlarmName': sns_message}

            alarm_name = message_data.get('AlarmName')
            if not alarm_name:
                print("Could not find AlarmName in SNS message.")
                continue

            print(f"Processing alarm: {alarm_name}")
            log_link = get_log_stream_from_alarm(alarm_name)
            print(f"Latest Log Stream: {log_link}")

            # Optionally, you could send this link via SNS, Slack, or email.
            # For now, just returning/printing.
        return {"status": "success"}
    except Exception as e:
        print(f"Error processing SNS event: {e}")
        return {"status": "error", "details": str(e)}
