"""
Module: common_helper

This module provides common helper functions for encoding and headers.

"""
import decimal
import datetime
import json
from pymongo import MongoClient
from bson import ObjectId  # Import ObjectId from pymongo

class Encoder(json.JSONEncoder):
    """
    Encoder Function for all returns

    Accessibility: Private
    Returns: Dictionary
    """

    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        if isinstance(o, bytes):
            return str(o)
        if isinstance(o, datetime.datetime):
            return str(o)
        if isinstance(o, ObjectId):  # Handle ObjectId objects
            return str(o)
        if isinstance(o, object):
            return o.__dict__
        return super().default(o)


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

import hashlib
import hmac
import logging
import time
import os
import requests

SUMSUB_SECRET_KEY = os.environ['SUMSUB_SECRET_KEY']
SUMSUB_APP_TOKEN = os.environ['SUMSUB_APP_TOKEN']
SUMSUB_TEST_BASE_URL = "https://api.sumsub.com"
REQUEST_TIMEOUT = 120


def create_applicant(external_user_id, level_name):
    # https://developers.sumsub.com/api-reference/#creating-an-applicant
    body = {'externalUserId': external_user_id}
    params = {'levelName': level_name}
    headers = {
        'Content-Type': 'application/json',
        'Content-Encoding': 'utf-8'
    }
    resp = sign_request(
        requests.Request('POST', SUMSUB_TEST_BASE_URL + '/resources/applicants?levelName=' + level_name,
                         params=params,
                         data=json.dumps(body),
                         headers=headers))
    s = requests.Session()
    response = s.send(resp, timeout=REQUEST_TIMEOUT)
    applicant_id = response.json()['id']
    return applicant_id


def add_document(applicant_id):
    # https://developers.sumsub.com/api-reference/#adding-an-id-document
    with open('img.jpg', 'wb') as handle:
        response = requests.get('https://fv2-1.failiem.lv/thumb_show.php?i=gdmn9sqy&view', stream=True,
                                timeout=REQUEST_TIMEOUT)
        if not response.ok:
            logging.error(response)

        for block in response.iter_content(1024):
            if not block:
                break
            handle.write(block)
    payload = {"metadata": '{"idDocType":"PASSPORT", "country":"USA"}'}
    resp = sign_request(
        requests.Request('POST', SUMSUB_TEST_BASE_URL + '/resources/applicants/' + applicant_id + '/info/idDoc',
                         data=payload,
                         files=[('content', open('img.jpg', 'rb'))]
                         ))
    sw = requests.Session()
    response = sw.send(resp, timeout=REQUEST_TIMEOUT)
    return response.headers['X-Image-Id']


def get_applicant_status(applicant_id):
    # https://developers.sumsub.com/api-reference/#getting-applicant-status-api
    url = SUMSUB_TEST_BASE_URL + '/resources/applicants/' + applicant_id + '/requiredIdDocsStatus'
    resp = sign_request(requests.Request('GET', url))
    s = requests.Session()
    response = s.send(resp, timeout=REQUEST_TIMEOUT)
    return response


def get_access_token(external_user_id, level_name):
    # https://developers.sumsub.com/api-reference/#access-tokens-for-sdks
    params = {'userId': external_user_id, 'ttlInSecs': '600', 'levelName': level_name}
    headers = {'Content-Type': 'application/json',
               'Content-Encoding': 'utf-8'
               }
    resp = sign_request(requests.Request('POST', SUMSUB_TEST_BASE_URL + '/resources/accessTokens',
                                         params=params,
                                         headers=headers))
    s = requests.Session()
    response = s.send(resp, timeout=REQUEST_TIMEOUT)
    token = response.json()['token']

    return token


def sign_request(request: requests.Request) -> requests.PreparedRequest:
    prepared_request = request.prepare()
    now = int(time.time())
    method = request.method.upper()
    path_url = prepared_request.path_url  # includes encoded query params
    # could be None so we use an empty **byte** string here
    body = b'' if prepared_request.body is None else prepared_request.body
    if type(body) == str:
        body = body.encode('utf-8')
    data_to_sign = str(now).encode('utf-8') + method.encode('utf-8') + path_url.encode('utf-8') + body
    # hmac needs bytes
    signature = hmac.new(
        SUMSUB_SECRET_KEY.encode('utf-8'),
        data_to_sign,
        digestmod=hashlib.sha256
    )
    prepared_request.headers['X-App-Token'] = SUMSUB_APP_TOKEN
    prepared_request.headers['X-App-Access-Ts'] = str(now)
    prepared_request.headers['X-App-Access-Sig'] = signature.hexdigest()
    return prepared_request


# Such actions are presented below:
# 1) Creating an applicant
# 2) Adding a document to the applicant
# 3) Getting applicant status
# 4) Getting access token
# def main():
#     logging.basicConfig(level=logging.INFO)
#     external_user_id = str(uuid.uuid4())
#     # external_user_id="c34ed318-7fad-4b8f-bd41-4e244013042e"
#     print(external_user_id)
#     level_name = 'basic-kyc-level'
#     applicant_id = create_applicant(external_user_id, level_name)
#     print(applicant_id)
#     # logging.info(applicant_id)
#     # image_id = add_document(applicant_id)
#     # logging.info(image_id)
#     # status = get_applicant_status(applicant_id)
#     # logging.info(status)
#     token = get_access_token(external_user_id, level_name)
#     logging.info(token)


# if __name__ == '__main__':
#     exit(main())

def update_by_email(email, update_data,table_name):
    """
    Update user details in MongoDB by email.

    Args:
        email (str): Email address of the user to update.
        update_data (dict): Dictionary containing the fields to update.

    Returns:
        bool: True if the update was successful, False otherwise.
    """
    try:
        # MongoDB configuration
        client = MongoClient(
                      os.environ['MONGO_CLIENT']
                    #   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
        db = client[os.environ['DATABASE']]
        collection = db[table_name]

        # Remove the email field from the update_data to avoid accidentally changing it
        if 'email_address' in update_data:
            del update_data['email_address']

        # Update the user's data in the collection
        update_result = collection.update_one(
            {'email_address': email}, {'$set': update_data})
        client.close()

        if update_result.modified_count > 0:
            return True
        return False
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise