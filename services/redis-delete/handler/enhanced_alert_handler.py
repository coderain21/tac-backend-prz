"""Enhanced CloudWatch alarm handler for API and Lambda alerts."""
import json
import re
import boto3
import os
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """Main handler for CloudWatch alarms"""
    print(f"Event: {json.dumps(event, indent=2, default=str)}")
    
    sns = boto3.client('sns')
    
    # Handle SNS trigger
    if 'Records' in event:
        for record in event['Records']:
            if 'Sns' in record:
                message = json.loads(record['Sns']['Message'])
                process_alarm(message, sns)
    else:
        process_alarm(event, sns)
    
    return {'statusCode': 200}

def process_alarm(message, sns):
    """Process alarm and send enhanced notification"""
    
    alarm_name = message.get('AlarmName', 'Unknown')
    reason = message.get('NewStateReason', '')
    description = message.get('AlarmDescription', '')
    
    print(f"Processing alarm: {alarm_name}")
    print(f"Reason: {reason}")
    
    # Determine if it's API or Lambda alarm
    if '5xx' in alarm_name.lower():
        # API Gateway alarm - find specific failing endpoint
        failed_endpoint = find_failing_api_endpoint(alarm_name, reason)
        log_link = get_api_log_stream(failed_endpoint, reason)
        alert_msg = create_api_alert(alarm_name, failed_endpoint, reason, description, log_link)
    else:
        # Lambda function alarm
        lambda_name = extract_lambda_name(alarm_name)
        log_link = get_lambda_log_group(lambda_name)
        alert_msg = create_lambda_alert(alarm_name, lambda_name, reason, description, log_link)
    
    # Send notification
    destination_topic = os.environ.get('SNS_TOPIC_ARN')
    if destination_topic:
        sns.publish(
            TopicArn=destination_topic,
            Message=alert_msg,
            Subject=f"Alert: {alarm_name}"
        )

def find_failing_api_endpoint(alarm_name, reason):
    """Find the specific API endpoint that failed by querying CloudWatch"""
    
    # Parse timestamp from reason
    timestamp_match = re.search(r'\((\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\)', reason)
    if not timestamp_match:
        return get_fallback_endpoint(alarm_name)
    
    timestamp_str = timestamp_match.group(1)
    try:
        alarm_time = datetime.strptime(f"20{timestamp_str}", "%Y%d/%m/%y %H:%M:%S")
    except:
        return get_fallback_endpoint(alarm_name)
    
    # Query CloudWatch for specific failing endpoint
    cloudwatch = boto3.client('cloudwatch', region_name='eu-west-2')
    stage = os.environ.get('STAGE', 'dev')
    
    # Define endpoints to check based on alarm type
    endpoints_to_check = get_endpoints_for_alarm(alarm_name, stage)
    
    # Check each endpoint for errors at alarm time
    for api_name, resource, method in endpoints_to_check:
        try:
            response = cloudwatch.get_metric_statistics(
                Namespace='AWS/ApiGateway',
                MetricName='5XXError',
                Dimensions=[
                    {'Name': 'ApiName', 'Value': api_name},
                    {'Name': 'Resource', 'Value': resource},
                    {'Name': 'Stage', 'Value': stage},
                    {'Name': 'Method', 'Value': method}
                ],
                StartTime=alarm_time - timedelta(minutes=2),
                EndTime=alarm_time + timedelta(minutes=2),
                Period=60,
                Statistics=['Sum']
            )
            
            for datapoint in response.get('Datapoints', []):
                if datapoint.get('Sum', 0) > 0:
                    return resource
                    
        except Exception as e:
            print(f"Error checking {resource}: {e}")
            continue
    
    return get_fallback_endpoint(alarm_name)

def get_endpoints_for_alarm(alarm_name, stage):
    """Get list of endpoints to check based on alarm name"""
    
    if 'auth' in alarm_name.lower():
        return [
            (f'{stage}-subdomain', '/subdomain', 'GET'),
            (f'{stage}-subdomain', '/subdomain', 'PATCH'),
            (f'{stage}-buyers', '/otp-validation', 'POST'),
            (f'{stage}-users-management', '/otp-validation', 'POST'),
            (f'{stage}-buyers', '/verify-captcha', 'POST'),
            (f'{stage}-users-management', '/verify-captcha', 'POST'),
            (f'{stage}-users-management', '/auth/login', 'GET'),
            (f'{stage}-users-management', '/request-otp', 'POST'),
            (f'{stage}-buyers', '/auction-register', 'GET'),
            (f'{stage}-buyers', '/verify-card', 'POST')
        ]
    elif 'payments' in alarm_name.lower():
        return [
            (f'{stage}-bids', '/update', 'PATCH'),
            (f'{stage}-payments', '/stripe', 'GET'),
            (f'{stage}-paypal', '/paypal-order', 'POST'),
            (f'{stage}-paypal', '/capture-order', 'GET'),
            (f'{stage}-cart-management', '/cart', 'GET'),
            (f'{stage}-auctions', '/', 'POST'),
            (f'{stage}-auctions', '/lots', 'POST'),
            (f'{stage}-auctions', '/update/{auction_id}', 'PATCH')
        ]
    elif 'viewing' in alarm_name.lower():
        return [
            (f'{stage}-buyers', '/view', 'GET'),
            (f'{stage}-buyers', '/view-lots', 'GET'),
            (f'{stage}-buyers', '/lot-details', 'GET'),
            (f'{stage}-buyers', '/paddle', 'GET'),
            (f'{stage}-auctions', '/view', 'GET'),
            (f'{stage}-auctions', '/{auction_id}', 'PATCH')
        ]
    elif 'profile' in alarm_name.lower():
        return [
            (f'{stage}-buyers', '/update-password', 'POST'),
            (f'{stage}-buyers', '/forgot_password', 'POST'),
            (f'{stage}-buyers', '/reset_password', 'POST'),
            (f'{stage}-users-management', '/forgot_password', 'POST'),
            (f'{stage}-users-management', '/reset_password', 'POST'),
            (f'{stage}-buyers', '/profile', 'PATCH'),
            (f'{stage}-address-management', '/address', 'POST'),
            (f'{stage}-address-management', '/address', 'GET')
        ]
    elif 'management' in alarm_name.lower():
        return [
            (f'{stage}-auctions', '/clone', 'POST'),
            (f'{stage}-bids', '/', 'GET'),
            (f'{stage}-buyers', '/approval', 'PATCH'),
            (f'{stage}-auctions', '/lots', 'PATCH'),
            (f'{stage}-auctions', '/lots', 'DELETE'),
            (f'{stage}-auctions', '/import', 'POST')
        ]
    elif 'search' in alarm_name.lower():
        return [
            (f'{stage}-buyers', '/search-lots', 'GET'),
            (f'{stage}-buyer-wishlist', '/', 'POST'),
            (f'{stage}-buyer-wishlist', '/remove', 'DELETE'),
            (f'{stage}-buyer-wishlist', '/wishlist', 'GET'),
            (f'{stage}-orders', '/seller', 'GET'),
            (f'{stage}-newsletter', '/', 'GET')
        ]
    
    return []

def get_fallback_endpoint(alarm_name):
    """Get fallback endpoint based on alarm name"""
    
    if 'auth' in alarm_name.lower():
        return '/subdomain'
    elif 'payments' in alarm_name.lower():
        return '/stripe'
    elif 'viewing' in alarm_name.lower():
        return '/lot-details'
    elif 'profile' in alarm_name.lower():
        return '/forgot_password'
    elif 'management' in alarm_name.lower():
        return '/clone'
    elif 'search' in alarm_name.lower():
        return '/search-lots'
    
    return '/unknown'

def get_api_log_stream(endpoint, reason):
    """Get specific log stream link for API endpoint."""
    stage = os.environ.get('STAGE', 'dev')
    region = os.environ.get('AWS_REGION', 'eu-west-2')
    
    endpoint_to_lambda = {
        '/subdomain': f'/aws/lambda/subdomain-{stage}-sub-domain',
        '/otp-validation': f'/aws/lambda/buyers-{stage}-otp-validation',
        '/verify-captcha': f'/aws/lambda/buyers-{stage}-verify-recaptha',
        '/auth/login': f'/aws/lambda/users-management-{stage}-generate_token',
        '/request-otp': f'/aws/lambda/users-management-{stage}-request-otp',
        '/auction-register': f'/aws/lambda/buyers-{stage}-auction_register',
        '/verify-card': f'/aws/lambda/buyers-{stage}-credit_card',
        '/update': f'/aws/lambda/bids-{stage}-add-to-group',
        '/stripe': f'/aws/lambda/payments-{stage}-create_intent',
        '/paypal-order': f'/aws/lambda/paypal-{stage}-create-order',
        '/capture-order': f'/aws/lambda/paypal-{stage}-paypal-capture-order',
        '/cart': f'/aws/lambda/cart-management-{stage}-view_cart',
        '/': f'/aws/lambda/auctions-{stage}-create',
        '/lots': f'/aws/lambda/auctions-{stage}-create_lots',
        '/view': f'/aws/lambda/buyers-{stage}-view',
        '/view-lots': f'/aws/lambda/buyers-{stage}-view_lots',
        '/lot-details': f'/aws/lambda/buyers-{stage}-view_lot_details',
        '/paddle': f'/aws/lambda/buyers-{stage}-paddle_number',
        '/forgot_password': f'/aws/lambda/buyers-{stage}-send-reset-link',
        '/reset_password': f'/aws/lambda/buyers-{stage}-update-new-password',
        '/profile': f'/aws/lambda/buyers-{stage}-view_profile',
        '/address': f'/aws/lambda/address-management-{stage}-add_shipping_address',
        '/clone': f'/aws/lambda/auctions-{stage}-clone_auction',
        '/approval': f'/aws/lambda/buyers-{stage}-acceting_buyer',
        '/import': f'/aws/lambda/auctions-{stage}-import_lots',
        '/search-lots': f'/aws/lambda/buyers-{stage}-search_lots'
    }

    log_group = endpoint_to_lambda.get(endpoint)
    if not log_group:
        return None

    # Try to extract timestamp from the alarm reason
    timestamp_match = re.search(r'\((\d{2})/(\d{2})/(\d{2}) (\d{2}):(\d{2}):(\d{2})\)', reason)
    if timestamp_match:
        try:
            day, month, year, hour, minute, second = map(int, timestamp_match.groups())
            alarm_time = datetime(year=2000+year, month=month, day=day, hour=hour, minute=minute, second=second)
            return get_log_stream_at_time(log_group, alarm_time, region)
        except Exception as e:
            print(f"Timestamp parse failed: {e}")

    # fallback to latest stream if timestamp not found
    return get_log_stream_at_time(log_group, None, region)


def get_log_stream_at_time(log_group, alarm_time=None, region='eu-west-2'):
    """Get specific log stream link for Lambda function near alarm time"""
    logs_client = boto3.client('logs', region_name=region)
    
    try:
        response = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy='LastEventTime',
            descending=True,
            limit=5
        )

        if not response.get('logStreams'):
            raise ValueError("No log streams found")

        # If alarm_time is available, pick the stream closest to it
        if alarm_time:
            alarm_timestamp_ms = int(alarm_time.timestamp() * 1000)
            closest_stream = None
            closest_diff = float('inf')
            for stream in response['logStreams']:
                start = stream.get('firstEventTime', 0)
                end = stream.get('lastEventTime', 0)
                if start <= alarm_timestamp_ms <= end:
                    closest_stream = stream
                    break
                # else find closest by time difference
                diff = abs(alarm_timestamp_ms - end)
                if diff < closest_diff:
                    closest_diff = diff
                    closest_stream = stream
            stream_name = closest_stream['logStreamName']
        else:
            # fallback to latest stream
            stream_name = response['logStreams'][0]['logStreamName']

        encoded_log_group = log_group.replace('/', '$252F')
        encoded_stream_name = stream_name.replace('/', '$252F').replace('[', '$255B').replace(']', '$255D')

        return f"https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{encoded_log_group}/log-events/{encoded_stream_name}"

    except Exception as e:
        print(f"Error fetching log stream for {log_group}: {e}")
        encoded_log_group = log_group.replace('/', '$252F')
        return f"https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{encoded_log_group}"

def extract_lambda_name(alarm_name):
    """Extract Lambda function name from alarm"""
    
    if 'process-cart' in alarm_name.lower() or 'process cart' in alarm_name.lower():
        return 'Process Cart Lambda'
    elif 'save-to-cache' in alarm_name.lower() or 'save to cache' in alarm_name.lower():
        return 'Save to Cache Lambda'
    elif 'batch-lots-publish' in alarm_name.lower() or 'batch lots publish' in alarm_name.lower():
        return 'Batch Lots Publish Lambda'
    elif 'batch-lots-update' in alarm_name.lower() or 'batch lots update' in alarm_name.lower():
        return 'Batch Lots Update Lambda'
    elif 'throttling' in alarm_name.lower():
        return 'Unpublish Auction Lambda'
    
    return 'Unknown Lambda'

def get_lambda_log_group(lambda_name):
    """Get log group or specific log stream link for a Lambda function"""
    stage = os.environ.get('STAGE', 'dev')
    region = os.environ.get('AWS_REGION', 'eu-west-2')
    
    lambda_to_log_group = {
        'Process Cart Lambda': f'/aws/lambda/auctions-{stage}-process-cart',
        'Save to Cache Lambda': f'/aws/lambda/auctions-{stage}-save-to-cache',
        'Batch Lots Publish Lambda': f'/aws/lambda/auctions-{stage}-batchLotsPublish',
        'Batch Lots Update Lambda': f'/aws/lambda/auctions-{stage}-batchLotsUpdate',
        'Unpublish Auction Lambda': f'/aws/lambda/auctions-{stage}-unpublish_auction'
    }
    
    log_group = lambda_to_log_group.get(lambda_name, '')
    if not log_group:
        return ""

    try:
        logs_client = boto3.client('logs', region_name=region)
        
        # Fetch the 3 most recent log streams by last event time
        response = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy='LastEventTime',
            descending=True,
            limit=3
        )
        
        # Use the most recent stream (if exists)
        if response.get('logStreams'):
            stream_name = response['logStreams'][0]['logStreamName']
            
            # Encode for URL format
            encoded_log_group = log_group.replace('/', '$252F')
            encoded_stream_name = stream_name.replace('/', '$252F').replace('[', '$255B').replace(']', '$255D')
            
            return f"https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{encoded_log_group}/log-events/{encoded_stream_name}"
        
    except Exception as e:
        print(f"Error fetching log stream for {lambda_name}: {e}")

    # fallback to log group if no stream found
    encoded_log_group = log_group.replace('/', '$252F')
    return f"https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{encoded_log_group}"

def get_priority(alarm_name):
    """Extract priority from alarm name"""
    
    if alarm_name.lower().startswith('p1-'):
        return 'P1 CRITICAL'
    elif alarm_name.lower().startswith('p2-'):
        return 'P2 MEDIUM'
    elif alarm_name.lower().startswith('p3-'):
        return 'P3 LOW'
    
    return 'UNKNOWN'

def create_api_alert(alarm_name, endpoint, reason, description, log_link):
    """Create API alert message"""
    
    priority = get_priority(alarm_name)
    
    msg = f"""🚨 API 5XX ERROR - {priority}

Failed Endpoint: {endpoint}
Alarm: {alarm_name}
Description: {description}

Reason: {reason}
"""
    
    if log_link:
        if 'log-events' in log_link:
            msg += f"\nExact Log Stream: {log_link}"
        else:
            msg += f"\nLog Group: {log_link}"
    
    return msg

def create_lambda_alert(alarm_name, lambda_name, reason, description, log_link):
    """Create Lambda alert message"""
    
    priority = get_priority(alarm_name)
    
    msg = f"""🚨 LAMBDA ERROR - {priority}

Failed Function: {lambda_name}
Alarm: {alarm_name}
Description: {description}

Reason: {reason}
"""
    
    if log_link:
        msg += f"\nLog Group: {log_link}"
    
    return msg