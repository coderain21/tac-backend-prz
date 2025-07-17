'''This is hooks file for lot-bid-history service'''
from dredd_hooks import before_each, after_each
import os
import json
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
        '/password-update/' in transaction['request']['uri'] or
        '/verify-captcha' in transaction['request']['uri'] or
        '/request-otp' in transaction['request']['uri'] or
        '/otp-validation' in transaction['request']['uri'] or
        '/reset_password' in transaction['request']['uri'] or
        '/forgot_password' in transaction['request']['uri'] or
        '/generate' in transaction['request']['uri'] or
        '/kyb-generate'  in transaction['request']['uri']


    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
    token = str(os.environ.get('USER'))

    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'


    if transaction['expected']['statusCode'] == '400':
        transaction['request']['body'] = json.dumps({
            "first_name": "Sandhya",
            "last_name": "s",
            "user_type": "seller",
            "last_name": "V B",
            "website": "647837fb11c55cf90b4b70e6",
            "branches": "*",
            "user_type": "institution-user",
            "institution_id": "646da9f3146f9d633b7c4830",
            "status": "active",
        })

    if (
        transaction['expected']['statusCode'] == '200' or
        transaction['expected']['statusCode'] == '204'
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])


@before_each
def prepare_delete_bid_test(transaction):
    if '/admin/bid/' in transaction['request']['uri'] and transaction['request']['method'] == 'DELETE':
        # Set up a valid bid ID for testing
        transaction['request']['uri'] = transaction['request']['uri'].replace('{bid_id}', '682acbe62ddaf4fca7223db9')
        transaction['skip'] = False
