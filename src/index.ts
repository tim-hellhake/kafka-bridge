/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import {AddonManager, Manifest} from 'gateway-addon';
import {KafkaBridge} from './kafka-bridge';

export default function(
  addonManager: AddonManager, manifest: Manifest): void {
  new KafkaBridge(addonManager, manifest);
}
