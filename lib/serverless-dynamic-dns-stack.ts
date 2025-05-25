import { Construct } from 'constructs';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { DomainName, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
    Effect,
    PolicyDocument,
    PolicyStatement,
    Role,
    ServicePrincipal
} from "aws-cdk-lib/aws-iam";

interface ServerlessDynamicDnsStackProps extends StackProps {
    hostedZoneName: string;
    apiGwARecord: string;
}

export class ServerlessDynamicDnsStack extends Stack {

    constructor( scope: Construct, id: string, props: ServerlessDynamicDnsStackProps ) {

        super( scope, id, props );

        const hostedZone =
            HostedZone.fromLookup( this, 'Zone',
                { domainName: props.hostedZoneName } );

        const configTable = new Table( this, 'ConfigTable', {
            partitionKey: {
                name: 'domain',
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY
        } );

        const getIpLambda = new NodejsFunction( this, 'getIpLambda', {
            description: "getIpLambda",
            entry: 'lambdas/getIpLambda.ts',
            handler: 'handler',
            runtime: Runtime.NODEJS_22_X,
            architecture: Architecture.ARM_64,
            timeout: Duration.seconds( 10 ),
            memorySize: 512,
            bundling: {
                commandHooks: {
                    afterBundling: ( _inputDir: string, outputDir: string ): string[] => [
                        `mkdir -p ${ outputDir }/assets/maxmind`,
                        `curl -L https://git.io/GeoLite2-ASN.mmdb -o ${ outputDir }/assets/maxmind/GeoLite2-ASN.mmdb`,
                        `curl -L https://git.io/GeoLite2-City.mmdb -o ${ outputDir }/assets/maxmind/GeoLite2-City.mmdb`,
                    ],
                    beforeBundling: ( _inputDir: string, _outputDir: string ): string[] => [],
                    beforeInstall: ( _inputDir: string, _outputDir: string ): string[] => []
                }
            }
        } );

        const updateDnsLambda = new NodejsFunction( this, 'updateDnsLambda', {
            description: "updateDnsLambda",
            entry: 'lambdas/updateDnsLambda.ts',
            handler: 'handler',
            runtime: Runtime.NODEJS_22_X,
            architecture: Architecture.ARM_64,
            timeout: Duration.seconds( 10 ),
            memorySize: 512,
            environment: {
                "CONFIG_TABLE": configTable.tableArn,
            },
            role: new Role( this, 'UpdateDnsLambdaRole', {
                assumedBy: new ServicePrincipal( 'lambda.amazonaws.com' ),
                inlinePolicies: {
                    DdbR53: new PolicyDocument( {
                        statements: [
                            new PolicyStatement( {
                                effect: Effect.ALLOW,
                                actions: [ 'dynamodb:GetItem' ],
                                resources: [ configTable.tableArn ],
                            } ),
                            new PolicyStatement( {
                                effect: Effect.ALLOW,
                                actions: [
                                    'route53:ChangeResourceRecordSets'
                                ],
                                resources: [ `arn:aws:route53:::hostedzone/${ hostedZone.hostedZoneId }` ]
                            } ),
                        ],
                    } ),
                },
            } ),
        } );

        const customDomain = new DomainName( this, 'ApiDomainName', {
            domainName: props.apiGwARecord + '.' + props.hostedZoneName,
            certificate: new Certificate( this, 'ApiCertificate', {
                domainName: props.apiGwARecord + '.' + props.hostedZoneName,
                validation: CertificateValidation.fromDns( hostedZone )
            } ),
        } );

        const httpApi = new HttpApi( this, 'HttpApi', {
            apiName: 'DynDnsApi',
            defaultDomainMapping: { domainName: customDomain }
        } );

        httpApi.addRoutes( {
            path: '/get',
            methods: [ HttpMethod.GET ],
            integration: new HttpLambdaIntegration( 'GetIpIntegration', getIpLambda )
        } );

        httpApi.addRoutes( {
            path: '/update',
            methods: [ HttpMethod.GET ],
            integration: new HttpLambdaIntegration( 'UpdateDnsIntegration', updateDnsLambda )
        } );

        new ARecord( this, 'ApiGatewayAliasRecord', {
            zone: hostedZone,
            recordName: props.apiGwARecord,
            target: RecordTarget.fromAlias(
                new ApiGatewayv2DomainProperties(
                    customDomain.regionalDomainName,
                    customDomain.regionalHostedZoneId,
                )
            )
        } );
    }
}