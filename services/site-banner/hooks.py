from dredd_hooks import before_each, after_each
import os
import logging
import urllib.parse

# Configure logging with more detailed format including log level
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    filename='hooks.log',
    filemode='a'
)


@after_each
def skip_404_test_results(transaction):
    if (
        transaction['expected']['statusCode'] in ['500', '404', '403', '400']
    ):
        transaction['skip'] = True


notification_id = None
@before_each
def set_authorization(transaction):
    token = str(os.environ.get('ADMIN'))
    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'


    if (
        transaction['expected']['statusCode'] in ['200', '204']
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])

    global notification_id

    # Set notification_id first if it's a create operation
    if transaction['expected']['statusCode'] == '201' and '/' in transaction['request']['uri']:
        try:
            logging.info(transaction['real']['body'])
            notification_id = transaction['real']['body']['notification_id']
        except (KeyError, TypeError):
            logging.error("Could not set notification_id from response")
            pass

    # Then handle delete operation
    if '/67f3bf494d4a369d223917f5' in transaction['request']['uri'] and transaction['request']['method'] == 'DELETE':
        if notification_id:
            transaction['fullPath'] = transaction['fullPath'].replace('CMP00218', notification_id)
            transaction['request']['uri'] = transaction['request']['uri'].replace('67f3bf494d4a369d223917f5', notification_id)
        else:
            transaction['skip'] = True
