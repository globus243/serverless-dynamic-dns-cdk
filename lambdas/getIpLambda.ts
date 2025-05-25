import { readFileSync } from "fs";
import { promises as dns } from "dns"

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

import { AsnResponse, CityResponse, Reader } from "mmdb-lib";


export const handler = async ( event: APIGatewayProxyEventV2 ): Promise<APIGatewayProxyResultV2> => {

    const requesterIp = event.requestContext.http.sourceIp;

    const cities = readFileSync( './assets/maxmind/GeoLite2-City.mmdb' );
    const isps = readFileSync( './assets/maxmind/GeoLite2-ASN.mmdb' );

    const cityReader = new Reader<CityResponse>( cities );
    const ispReader = new Reader<AsnResponse>( isps );

    let cityResult = cityReader.get( requesterIp )
    let ispResult = ispReader.get( requesterIp )

    let hostname: string | undefined = undefined;
    try {
        const names = await dns.reverse( requesterIp );
        if ( names && names.length > 0 ) hostname = names[ 0 ];
    } catch { }

    return {
        statusCode: 200,
        body: JSON.stringify( {
            user_agent: event.requestContext.http.userAgent || "N/A",
            ip: requesterIp,
            hostname: hostname || "N/A",
            latitude: cityResult?.location?.latitude || "N/A",
            longitude: cityResult?.location?.longitude || "N/A",
            city: cityResult?.city?.names?.en || "N/A",
            region: cityResult?.subdivisions?.[ 0 ]?.names?.en || "N/A",
            country: cityResult?.country?.names?.en || "N/A",
            country_code: cityResult?.country?.iso_code || "N/A",
            continent: cityResult?.continent?.names?.en || "N/A",
            is_eu: cityResult?.registered_country?.is_in_european_union || false,
            local_timezone: cityResult?.location?.time_zone || "N/A",
            isp: ispResult?.autonomous_system_organization || "N/A"
        } )
    }
}