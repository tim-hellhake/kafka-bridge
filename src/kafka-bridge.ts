/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import {Adapter, AddonManager, Manifest} from 'gateway-addon';
import {WebThingsClient} from 'webthings-client';
import {Producer, KafkaClient, ProduceRequest} from 'kafka-node';

export class KafkaBridge extends Adapter {
  constructor(
    addonManager: AddonManager, private manifest: Manifest) {
    super(addonManager, KafkaBridge.name, manifest.name);
    addonManager.addAdapter(this);
    this.connectToKafka();
  }

  private connectToKafka() {
    const {
      kafkaHost,
    } = this.manifest.moziot.config;

    console.log(`Connecting to kafka at ${kafkaHost}`);

    const client = new KafkaClient({kafkaHost});
    const producer = new Producer(client);

    producer.on('ready', () => {
      this.connectToGateway(producer);
    });

    producer.on('error', (err) => {
      console.log(`Could not connect to kafka: ${err}`);
    });
  }

  private connectToGateway(producer: Producer) {
    console.log('Connecting to gateway');

    const {
      accessToken,
    } = this.manifest.moziot.config;

    (async () => {
      const webThingsClient = await WebThingsClient.local(accessToken);
      await webThingsClient.connect();
      webThingsClient.on('propertyChanged', async (
        deviceId: string, key: string, value: unknown) => {
        const messages: ProduceRequest[] = [{
          topic: deviceId,
          key,
          messages: value,
        }];

        producer.send(messages, (err) => {
          if (err) {
            console.log(`Could not send message: ${err}`);
          }
        });
      });
    })();
  }
}
