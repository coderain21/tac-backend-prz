"""
This module contains a Lambda function for performing image matching using the Scale-Invariant Feature Transform (SIFT) algorithm.

The Lambda function is designed to be triggered by an event and perform the following steps:
1. Download the original and target images from the provided URLs.
2. Convert the image buffers to NumPy arrays.
3. Decode the images using OpenCV and convert them to grayscale.
4. Resize the original image to match the size of the target image.
5. Use the SIFT algorithm to detect keypoints and compute descriptors for both images.
6. Create a FLANN (Fast Library for Approximate Nearest Neighbors) matcher for matching descriptors.
7. Match the descriptors between the images using the FLANN matcher and apply a ratio test to select good matches.
8. Calculate the matching percentage based on the number of good matches and the total number of keypoints in the original image.
9. Return the matching percentage as the response for the Lambda function.

Module Dependencies:
- json: For encoding the response as a JSON object.
- cv2 (OpenCV): For image processing and feature detection.
- numpy: For working with image buffers as NumPy arrays.
- urllib.request: For downloading images from URLs.

Note:
- This module assumes that the Lambda function is triggered with event data containing the URLs of the original and target images.
- The Lambda function uses the SIFT algorithm for feature detection and matching. Please ensure that the OpenCV library is properly installed and configured.
"""

import json
import cv2
import numpy as np

import urllib.request


def download_image(url):
    """
    Downloads an image from the specified URL and returns the image buffer.

    Args:
        url (str): The URL of the image to download.

    Returns:
        image_buffer (bytes): The image buffer read from the URL.
    """
    response = urllib.request.urlopen(url)
    image_buffer = response.read()
    return image_buffer


def lambda_handler(event, context):
    """
    Lambda function handler that performs image matching using SIFT (Scale-Invariant Feature Transform) algorithm.

    Args:
        event: The event data passed to the Lambda function.
        context: The runtime information and methods related to the current execution.

    Returns:
        dict: A dictionary containing the HTTP status code and the matching percentage as a JSON-encoded string.

    Raises:
        N/A
    """
    original_image_buffer = download_image("")
    target_image_buffer = download_image("")

    # Convert the image buffers to NumPy arrays
    original_image = np.frombuffer(original_image_buffer, dtype=np.uint8)
    target_image = np.frombuffer(target_image_buffer, dtype=np.uint8)
    del original_image_buffer
    del target_image_buffer
    # Decode the images using OpenCV
    original_image = cv2.imdecode(original_image, cv2.IMREAD_GRAYSCALE)
    target_image = cv2.imdecode(target_image, cv2.IMREAD_GRAYSCALE)

    # Resize the original image to match the size of the target image
    original_image = cv2.resize(
        original_image, (target_image.shape[1], target_image.shape[0]))

    # Create SIFT object
    sift = cv2.SIFT_create()

    # Detect keypoints and compute descriptors
    kp1, des1 = sift.detectAndCompute(original_image, None)
    del original_image
    kp2, des2 = sift.detectAndCompute(target_image, None)
    del target_image

    # FLANN parameters
    FLANN_INDEX_KDTREE = 1
    index_params= {"algorithm": FLANN_INDEX_KDTREE, "trees": 5}
    search_params={"checks": 50}

    # Create FLANN matcher
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    len_kp1 = len(kp1)
    del kp1
    del kp2
    # Match descriptors
    matches = flann.knnMatch(des1, des2, k=2)
    del des1
    del des2

    # Apply ratio test to select good matches
    good_matches = 0
    for m, n in matches:
        if m.distance < 0.8 * n.distance:
            good_matches += 1

    # Calculate matching percentage
    matching_percentage = good_matches / len_kp1 * 100

    return {
        'statusCode': 200,
        'body': json.dumps(f"matching percentage = {matching_percentage}")
    }
