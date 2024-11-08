'''This is hooks file for paypal service'''
from dredd_hooks import before_each, after_each
import os
import logging
import urllib.parse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    filename='hooks.log',
    filemode='a'
)


@after_each
def skip_404_test_results(transaction):
    if (
        transaction['expected']['statusCode'] == '500' or
        transaction['expected']['statusCode'] == '404' or
        transaction['expected']['statusCode'] == '403' or
        transaction['expected']['statusCode'] == '400'
    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
    token_seller = str(os.environ.get('USER'))
    print('s', transaction['expected']['statusCode'] == '400')
    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if (transaction['request']['method'] == 'PATCH' and '/paypal-disconnect' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (transaction['request']['method'] == 'GET' and '/paypal-connect' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (transaction['request']['method'] == 'POST' and '/paypal-order' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return