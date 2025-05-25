import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { ChangeResourceRecordSetsCommand, Route53Client, ChangeAction, RRType } from "@aws-sdk/client-route-53";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

import { createHash } from "node:crypto";

const CONFIG_TABLE = process.env.CONFIG_TABLE!;

const dynamoClient = new DynamoDBClient( {} );
const route53 = new Route53Client( {} );

const getConfig = async ( domain: string ): Promise<{ hostedZoneId: string, secret: string }> => {

    const command = await dynamoClient.send(
        new GetItemCommand( {
            TableName: CONFIG_TABLE,
            Key: {
                domain: { S: domain }
            }
        } )
    );

    if ( !command.Item ) {
        throw new Error( "Domain not found" );
    }

    return {
        hostedZoneId: command.Item.hostedZoneId.S!,
        secret: command.Item.secret.S!
    }
}

const setRecord = async ( domain: string, ip: string, hostedZoneId: string ): Promise<void> => {

    const response = await route53.send( new ChangeResourceRecordSetsCommand( {
        ChangeBatch: {
            Changes: [ {
                Action: ChangeAction.UPSERT,
                ResourceRecordSet: {
                    Name: domain,
                    Type: RRType.A,
                    TTL: 60,
                    ResourceRecords: [
                        { Value: ip }
                    ]
                }
            } ]
        },
        HostedZoneId: hostedZoneId
    } ) );

    if ( response.$metadata.httpStatusCode !== 200 ) {
        throw new Error( "Failed to update DNS" );
    }
}

export const handler = async ( event: APIGatewayProxyEventV2 ): Promise<APIGatewayProxyResultV2> => {

    const requesterIp = event.requestContext.http.sourceIp;

    const { domain, hash } = event.queryStringParameters as { domain: string, hash: string } || {};

    if ( !domain || !hash ) {
        return {
            statusCode: 400,
            body: JSON.stringify( { error: "Missing domain or hash" } )
        }
    }

    let config: { hostedZoneId: string, secret: string };
    try {
        config = await getConfig( domain );
    } catch ( e ) {
        return {
            statusCode: 400,
            body: JSON.stringify( { error: "invalid domain" } )
        }
    }

    const hashCalc = createHash( 'sha256' );
    hashCalc.update( config.secret + config.hostedZoneId + requesterIp );
    if ( hashCalc.digest( 'hex' ) !== hash ) {
        return {
            statusCode: 403,
            body: JSON.stringify( { error: "Invalid hash" } )
        }
    }

    try {
        await setRecord( domain, requesterIp, config.hostedZoneId );
    } catch ( e ) {
        return {
            statusCode: 500,
            body: JSON.stringify( { error: "Failed to update DNS" } )
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify( { message: "DNS updated" } )
    }
}