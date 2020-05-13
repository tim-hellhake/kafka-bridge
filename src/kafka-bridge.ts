/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter, } from 'gateway-addon';
import { WebThingsClient } from 'webthings-client';
import { client as WebSocketClient } from 'websocket';
import { Producer, KafkaClient, ProduceRequest } from 'kafka-node';

interface ThingEvent {
    messageType: string,
    data: {}
}

export class KafkaBridge extends Adapter {
    constructor(addonManager: any, private manifest: any) {
        super(addonManager, KafkaBridge.name, manifest.name);
        addonManager.addAdapter(this);
        this.connectToKafka();
    }

    private connectToKafka() {
        const {
            kafkaHost
        } = this.manifest.moziot.config;

        console.log(`Connecting to kafka at ${kafkaHost}`);

        const client = new KafkaClient({ kafkaHost });
        const producer = new Producer(client);

        producer.on('ready', () => {
            this.connectToGateway(producer);
        });

        producer.on('error', (err) => {
            console.log(`Could not connect to kafka: ${err}`);
        })
    }

    private connectToGateway(producer: Producer) {
        console.log('Connecting to gateway');

        const {
            accessToken
        } = this.manifest.moziot.config;

        (async () => {
            const webThingsClient = await WebThingsClient.local(accessToken);
            const devices = await webThingsClient.getDevices();

            for (const device of devices) {
                try {
                    const parts = device.href.split('/');
                    const deviceId = parts[parts.length - 1];

                    console.log(`Connecting to websocket of ${deviceId}`);
                    const thingUrl = `ws://localhost:8080${device.href}`;
                    const webSocketClient = new WebSocketClient();

                    webSocketClient.on('connectFailed', function (error) {
                        console.error(`Could not connect to ${thingUrl}: ${error}`)
                    });

                    webSocketClient.on('connect', function (connection) {
                        console.log(`Connected to ${thingUrl}`);

                        connection.on('error', function (error) {
                            console.log(`Connection to ${thingUrl} failed: ${error}`);
                        });

                        connection.on('close', function () {
                            console.log(`Connection to ${thingUrl} closed`);
                        });

                        connection.on('message', function (message) {
                            if (message.type === 'utf8' && message.utf8Data) {
                                const thingEvent = <ThingEvent>JSON.parse(message.utf8Data);

                                if (thingEvent.messageType === 'propertyStatus') {
                                    const messages: ProduceRequest[] = [];

                                    for (const [key, value] of Object.entries(thingEvent.data)) {
                                        messages.push({
                                            topic: deviceId,
                                            key,
                                            messages: value
                                        });
                                    }

                                    producer.send(messages, (err, _data) => {
                                        if (err) {
                                            console.log(`Could not send message: ${err}`);
                                        }
                                    });
                                }
                            }
                        });
                    });

                    webSocketClient.connect(`${thingUrl}?jwt=${accessToken}`);
                } catch (e) {
                    console.log(`Could not process device ${device.title} ${e}`);
                }
            }
        })();
    }
}
