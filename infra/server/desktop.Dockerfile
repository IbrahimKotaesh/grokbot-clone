FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11-utils x11vnc websockify openbox xdotool xclip scrot chromium \
    dbus-x11 xterm python3 python3-pil python3-pip git curl ca-certificates \
    fonts-noto-core fonts-noto-color-emoji procps coreutils \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/grokbot/profiles /root/grokbot/files /root/grokbot/screens
WORKDIR /root/grokbot
CMD ["sleep", "infinity"]
