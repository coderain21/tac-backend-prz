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
    token = str(os.environ.get('ADMIN'))
    print('s', transaction['expected']['statusCode'] == '400')
    transaction['request']['uri'] = urllib.parse.unquote(
        transaction['request']['uri'])

    if transaction['expected']['statusCode'] != '401':
        transaction['request']['headers']['Authorization'] = f'Bearer {token}'


    # if transaction['expected']['statusCode'] == '400':
    #     transaction['request']['body'] = json.dumps({
    #         "template_name": 3,
    #     })
    if (
        transaction['request']['method'] == 'PATCH' and
        '/unpublish-auction' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (
        transaction['request']['method'] == 'PATCH' and
        '/A0172' in transaction['request']['uri']
    ):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (transaction['request']['method'] == 'PATCH' and '/edit-auction/' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return

    if (transaction['request']['method'] == 'GET' and '/sellers' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return

    # skipping this test for now
    if (transaction['request']['method'] == 'GET' and '/buyers' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    

    if (transaction['request']['method'] == 'PATCH' and '/admin-update-password' in transaction['request']['uri']):
        print('Skipping the test...')
        transaction['skip'] = True
        return
    if (transaction['request']['method'] == 'PATCH' and '/enable-disable-seller' in transaction['request']['uri']):
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
