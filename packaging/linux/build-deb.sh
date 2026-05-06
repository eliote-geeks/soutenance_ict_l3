#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(cat "$ROOT_DIR/agent/VERSION")"
PACKAGE_NAME="netsentinel-agent"
BUILD_DIR="$ROOT_DIR/dist/${PACKAGE_NAME}_${VERSION}_amd64"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/DEBIAN" "$BUILD_DIR/usr/local/bin" "$BUILD_DIR/usr/share/doc/netsentinel-agent"

cat >"$BUILD_DIR/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: admin
Priority: optional
Architecture: amd64
Maintainer: NetSentinel AI
Depends: bash, curl, python3, systemd
Description: NetSentinel Agent bootstrap for Linux hosts
 One-command bootstrap to enroll a Linux machine into NetSentinel,
 request admin approval, receive activation, install Beats and start collection.
EOF

install -m 0755 "$ROOT_DIR/agent/install-linux.sh" "$BUILD_DIR/usr/local/bin/netsentinel-agent-install"
install -m 0644 "$ROOT_DIR/agent/README.md" "$BUILD_DIR/usr/share/doc/netsentinel-agent/README.md"
install -m 0644 "$ROOT_DIR/agent/VERSION" "$BUILD_DIR/usr/share/doc/netsentinel-agent/VERSION"

dpkg-deb --build "$BUILD_DIR"
echo "Built package: ${BUILD_DIR}.deb"
