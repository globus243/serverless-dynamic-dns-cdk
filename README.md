# About

Deploy a Serverless DynDNS service with IP lookup and reflection capabilities in AWS with CDK.

A full guide can be found on https://blog.timhartmann.de/2025/05/25/Serverless-DynDNS-and-IP-reflection-with-CDK/

## Quick setup

Clone the repo and adjust your deployment parameters in `./bin/serverless-dynamic-dns.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import { ServerlessDynamicDnsStack } from '../lib/serverless-dynamic-dns-stack';

const app = new cdk.App();
new ServerlessDynamicDnsStack(app, 'ServerlessDynamicDnsStack', {
    env: { account: 'xxxx', region: 'eu-central-1' },
    hostedZoneName: 'yourdomain.com',
    apiGwARecord: 'dyndns'
});
```

Then run:

```bash
npm install
npm run build
cdk deploy
```
lastly, create a config set in the DynamoDB table `ServerlessDynamicDnsStack-ConfigTable` with the following attributes:
```json
{
    "hostname": "home.yourdomain.com" // Replace with the domain you want to update
    "hostedZoneId": "ZXXXXXXXXXXXXXX", // Replace with your actual Hosted Zone ID
    "sharedSecret": "your_shared_secret", // Replace with secure password
}
```

# To update your DNS record with your current IP address
````typescript
const { createHash } = await import("node:crypto");

const HOSTED_ZONE_ID = "ZXXXXXXXXXXXXXX"; // Replace with your actual Hosted Zone ID
const SHARED_SECRET = "your_shared_secret"; // Replace with your actual shared secret
const HOSTNAME = "home.yourdomain.com"; // Replace with the domain you want to update

const currentIp = await fetch("https://dyndns.yourdomain.com/get")
    .then(response => response.json())
    .then(data => data.ip);

const hashCalc = createHash('sha256');
hashCalc.update(SHARED_SECRET + HOSTED_ZONE_ID + currentIp);
const hash = hashCalc.digest('hex');

const url = `https://dyndns.yourdomain.com/update?hostname=${HOSTNAME}&hash=${hash}`;

fetch(url)
    .then(response => {
        if (response.ok) {
            console.log("IP updated successfully");
        } else {
            console.error("Failed to update IP:", response.statusText);
        }
    })
    .catch(error => {
        console.error("Error:", error);
    });
````