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
import {Property} from 'webthings-client/lib/property';

export class KafkaBridge extends Adapter {
  private topicsInProgress: Record<string, ProduceRequest[]> = {};

  private client: KafkaClient;

  private producer: Producer;

  constructor(
    addonManager: AddonManager, private manifest: Manifest) {
    super(addonManager, KafkaBridge.name, manifest.name);
    addonManager.addAdapter(this);

    const {
      kafkaHost,
    } = this.manifest.moziot.config as Record<string, string>;

    console.log(`Connecting to kafka at ${kafkaHost}`);

    this.client = new KafkaClient({kafkaHost});
    this.producer = new Producer(this.client);

    this.producer.on('ready', () => {
      console.log('Successfully connected to kafka');
      this.connectToGateway();
    });

    this.producer.on('error', (err) => {
      console.log(`Could not connect to kafka: ${err}`);
    });
  }

  private connectToGateway() {
    console.log('Connecting to gateway');

    const {
      accessToken,
    } = this.manifest.moziot.config;

    (async () => {
      const webThingsClient =
      await WebThingsClient.local(accessToken as string);
      const devices = await webThingsClient.getDevices();

      for (const device of devices) {
        const deviceId = device.id();
        await device.connect();
        // eslint-disable-next-line max-len
        console.log(`Successfully connected to ${device.description.title} (${deviceId})`);

        device.on('propertyChanged', (property: Property, value: unknown) => {
          this.onChange(deviceId, property.name, value);
        });
      }
    })();
  }

  private async onChange(deviceId: string, key: string, value: unknown) {
    const {
      debug,
      partitions,
      replicationFactor,
      asJson,
    } = this.manifest.moziot.config;

    const topic = deviceId.replace(/[^a-zA-Z0-9\\._-]/g, '_');

    let payload: string;

    if (asJson) {
      payload = JSON.stringify({[key]: value});
    } else {
      payload = `${value}`;
    }

    const message: ProduceRequest = {
      topic,
      key,
      messages: payload,
    };

    this.client.topicExists([topic], (error?: TopicsNotExistError) => {
      const queue = this.topicsInProgress[topic];

      if (queue) {
        console.log(
          `Topic create for ${topic} is in progress, queueing message`);

        queue.push(message);
        return;
      }

      if (error) {
        console.log(
          `Topic ${topic} does not exist, attempting to create it`);

        this.topicsInProgress[topic] = [message];

        const request: CreateTopicRequest = {
          topic,
          partitions: partitions as number ?? 1,
          replicationFactor: replicationFactor as number ?? 1,
        };

        this.client.createTopics([request], (error, result) => {
          if (error) {
            console.log(`Could not create topic ${topic}: ${error}`);
          } else if (result[0]?.error) {
            console.log(
              `Could not create topic ${topic}: ${result[0].error}`);
          } else {
            console.log(
              `Topic ${topic} created`);
            const queue = this.topicsInProgress[topic];
            console.log(`Sending ${queue.length} queued messages`);
            delete this.topicsInProgress[topic];

            this.producer.send(queue, (err) => {
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

        this.producer.send([message], (err) => {
          if (err) {
            console.log(`Could not send message: ${err}`);
          }
        });
      }
    });
  }
}
