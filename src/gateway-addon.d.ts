/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'gateway-addon' {
    class Adapter {
      constructor(_addonManager: unknown, _id: string, _packageName: string);
    }

    class AddonManager {
      addAdapter(_adapter: Adapter): void;
    }

    interface Manifest {
      name: string,
      moziot: {
        config: Record<string, string>
      }
    }
}
