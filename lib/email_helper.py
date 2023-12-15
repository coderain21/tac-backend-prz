"""
Module: email_helper

This module provides functionality to send emails using Amazon SES .

"""
import os
import json
import boto3

def send_mail(link, email_template, destination_address, token):
    """
    Send an email using Amazon SES with the provided link and email template.

    Args:
        link (str): The link to include in the email.
        email_template (str): The email template to use.
        destination_address (str): The email address of the recipient.
        token (str): The token to store in the MongoDB collection.

    Returns:
        dict: The status of the email sending operation.
    """
    try:
        sender_email = os.environ['SES_SENDER_EMAIL_ID']
        print(sender_email)
        client = boto3.client('ses',region_name= 'eu-west-2')
        param = {
            'Source': sender_email,
            'Template': email_template,
            'TemplateData': json.dumps({'link': link}),
            'Destination': {
                'ToAddresses': [destination_address],
            },
        }
        mail = client.send_templated_email(**param)
        print('mail', mail)
        if mail:
        #     client = MongoClient(os.environ['MONGO_CLIENT'])
        #     database = client[os.environ['DATABASE']]
        #     collection = database[os.environ['TOKENS_TABLE']]
        #     document = {
        #         "destination_address": destination_address,
        #         "token": token
        #     }

        #     result = collection.insert_one(document)
        #     print('Inserted document ID:', result.inserted_id)
            return {
                'status': True,
            }
        return {
            'status': False,
        }
    except boto3.exceptions.Boto3Error as error:
        print(error)
        return {
            'status': False,
        }
