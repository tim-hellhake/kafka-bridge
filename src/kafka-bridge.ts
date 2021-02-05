/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import {Adapter, AddonManager, Manifest} from 'gateway-addon';
import {WebThingsClient} from 'webthings-client';
import {Producer,
  KafkaClient,
  ProduceRequest,
  TopicsNotExistError,
  CreateTopicRequest} from 'kafka-node';

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
    } = this.manifest.moziot.config as Record<string, string>;

    console.log(`Connecting to kafka at ${kafkaHost}`);

    const client = new KafkaClient({kafkaHost});
    const producer = new Producer(client);

    producer.on('ready', () => {
      this.connectToGateway(client, producer);
    });

    producer.on('error', (err) => {
      console.log(`Could not connect to kafka: ${err}`);
    });
  }

  private connectToGateway(client: KafkaClient, producer: Producer) {
    console.log('Connecting to gateway');

    const topicsInProgress: Record<string, ProduceRequest[]> = {};

    const {
      accessToken,
      debug,
    } = this.manifest.moziot.config;

    (async () => {
      const webThingsClient =
      await WebThingsClient.local(accessToken as string);
      await webThingsClient.connect();
      webThingsClient.on('propertyChanged', async (
        deviceId: string, key: string, value: unknown) => {
        const topic = deviceId.replace(/[^a-zA-Z0-9\\._-]/g, '_');

        const message: ProduceRequest = {
          topic,
          key,
          messages: value,
        };

        client.topicExists([topic], (error?: TopicsNotExistError) => {
          const queue = topicsInProgress[topic];

          if (queue) {
            console.log(
              `Topic create for ${topic} is in progress, queueing message`);

            queue.push(message);
            return;
          }

          if (error) {
            console.log(
              `Topic ${topic} does not exist, attempting to create it`);

            topicsInProgress[topic] = [message];

            const request: CreateTopicRequest = {
              topic,
              partitions: 1,
              replicationFactor: 1,
            };

            client.createTopics([request], (error, result) => {
              if (error) {
                console.log(`Could not create topic ${topic}: ${error}`);
              } else if (result[0]?.error) {
                console.log(
                  `Could not create topic ${topic}: ${result[0].error}`);
              } else {
                console.log(
                  `Topic ${topic} created`);
                const queue = topicsInProgress[topic];
                console.log(`Sending ${queue.length} queued messages`);
                delete topicsInProgress[topic];

                producer.send(queue, (err) => {
                  if (err) {
                    console.log(`Could not send message: ${err}`);
                  }
                });
              }
            });
          } else {
            if (debug) {
              console.log(`Sending ${JSON.stringify(message, null, 2)}`);
            }

            producer.send([message], (err) => {
              if (err) {
                console.log(`Could not send message: ${err}`);
              }
            });
          }
        });
      });
    })();
  }
}
