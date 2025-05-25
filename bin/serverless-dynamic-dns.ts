#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ServerlessDynamicDnsStack } from '../lib/serverless-dynamic-dns-stack';

const app = new cdk.App();
new ServerlessDynamicDnsStack( app, 'ServerlessDynamicDnsStack', {
    /* If you don't specify 'env', this stack will be environment-agnostic.
     * Account/Region-dependent features and context lookups will not work,
     * but a single synthesized template can be deployed anywhere. */

    /* Uncomment the next line to specialize this stack for the AWS Account
     * and Region that are implied by the current CLI configuration. */
    // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

    /* Uncomment the next line if you know exactly what Account and Region you
     * want to deploy the stack to. */
    env: { account: '123456789012', region: 'eu-central-1' },

    /* The name of the hosted zone to use for the api gw */
    hostedZoneName: 'yourdomain.com',

    /* The name of the DNS Record to use for the api gw. For 'dyndns'.yourdomain.com use ddns */
    apiGwARecord: 'dyndns'
} );