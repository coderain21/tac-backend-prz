'''This is hooks file for auction service'''
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
        transaction['expected']['statusCode'] == '400' or
        '/password-update/' in transaction['request']['uri'] or
        '/verify-captcha' in transaction['request']['uri'] or
        '/otp-validation' in transaction['request']['uri'] or
        '/reset_password' in transaction['request']['uri'] or
        '/reorder-lots' in transaction['request']['uri'] or
        ('/lots' in transaction['request']['uri'] and
         transaction['request']['method'] == 'DELETE') or
        'del=' in transaction['request']['uri'] or
        '/stripe'  in transaction['request']['uri']


    ):
        transaction['skip'] = True


@before_each
def set_authorization(transaction):
    token = str(os.environ.get('USER'))
    if transaction['request']['uri'].startswith('/admin'):
        token = str(os.environ.get('ADMIN'))
    print('Expected Status Code:', transaction['expected']['statusCode'])
    print('Request Method:', transaction['request']['method'])
    print('Request URI:', transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'

    if (
        transaction['request']['method'] == 'PATCH' and
        '/A0008' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return

    if (
        transaction['expected']['statusCode'] == '200' or
        transaction['expected']['statusCode'] == '204'
    ):
        logging.info(transaction)
        transaction['request']['uri'] = urllib.parse.unquote(
            transaction['request']['uri'])
        logging.info(transaction['request'])
