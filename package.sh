#!/bin/bash -e

npm ci
npm run build
rm -rf node_modules

if [ -z "${ADDON_ARCH}" ]; then
  TARFILE_SUFFIX=
else
  NODE_VERSION="$(node --version)"
  TARFILE_SUFFIX="-${ADDON_ARCH}-${NODE_VERSION/\.*/}"
fi
# For openwrt-linux-arm and linux-arm we need to cross compile.
if [[ "${ADDON_ARCH}" =~ "linux-arm" ]]; then
  # We assume that CC and CXX are pointing to the cross compilers
  npm ci --ignore-scripts --production
  npm rebuild --arch=armv6l --target_arch=arm
else
  npm ci --production
fi

rm -rf node_modules/.bin

shasum --algorithm 256 package.json manifest.json lib/*.js LICENSE README.md > SHA256SUMS
find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS
TARFILE=`npm pack`
tar xzf ${TARFILE}
rm ${TARFILE}
TARFILE_ARCH="${TARFILE/.tgz/${TARFILE_SUFFIX}.tgz}"
cp -r node_modules ./package
tar czf ${TARFILE_ARCH} package
shasum --algorithm 256 ${TARFILE_ARCH} > ${TARFILE_ARCH}.sha256sum
rm -rf package
echo "Created ${TARFILE_ARCH}"
