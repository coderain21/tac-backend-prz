/* eslint-disable camelcase */
/* eslint-disable no-useless-escape */
/* eslint-disable import/no-extraneous-dependencies */
const AWS = require('aws-sdk')

const S3 = new AWS.S3()

const getDataUsingS3Select = async (params) => new Promise((resolve, reject) => {
    S3.selectObjectContent(params, (err, data) => {
        if (err) {
            reject(err)
        }

        if (!data) {
            reject(new Error('Empty data object'))
        }

        /**
            This will be an array of bytes of data, to be converted
         to a buffer
        */
        const records = []

        /* This is a stream of events */
        data.Payload.on('data', (event) => {
            /*
                    There are multiple events in the eventStream, but all we
                care about are Records events. If the event is a Records
                event, there is data inside it.
            */
            if (event.Records) {
                records.push(event.Records.Payload)
            }
        })
            .on('error', (error) => {
                reject(error)
            })
            .on('end', () => {
                /** Convert the array of bytes into a buffer, and then convert that to a string */
                let planetString = Buffer.concat(records).toString('utf8')

                /* remove any trailing commas */
                planetString = planetString.replace(/\,$/, '')

                /* Add into JSON 'array' */
                planetString = `[${planetString}]`

                try {
                    const planetData = JSON.parse(planetString)
                    resolve(planetData)
                } catch (e) {
                    reject(new Error(`Unable to convert S3 data to JSON object. S3 Select Query: ${params.Expression}`))
                }
            })
    })
})

module.exports.getDomainList = async (query_params) => {
    try {
        const params = {
            Bucket: 'easyidgen5-dev-assets',
            Key: 'domain-list/domains.json',
            ExpressionType: 'SQL',
            // eslint-disable-next-line no-use-before-define
            Expression: `SELECT * FROM S3Object[*][*] s WHERE LOWER(s.alias) = '${query_params.search}'`,
            InputSerialization: {
                JSON: {
                    Type: 'DOCUMENT',
                },
            },
            OutputSerialization: {
                JSON: {
                    RecordDelimiter: ',',
                },
            },
        }
        const data = await getDataUsingS3Select(params)

        return data
    } catch (error) {
        throw new Error(error)
    }
}
