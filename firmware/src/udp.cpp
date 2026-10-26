#include "udp.h"

#include <lwip/sockets.h>

namespace udp {

namespace {

int socketId = -1;

}  // namespace

bool begin(uint16_t port) {
  socketId = lwip_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (socketId < 0) {
    return false;
  }
  const int enabled = 1;
  lwip_setsockopt(socketId, SOL_SOCKET, SO_BROADCAST, &enabled, sizeof(enabled));
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_ANY);
  return lwip_bind(socketId, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0;
}

size_t receive(uint8_t* buffer, size_t size) {
  const int received = lwip_recv(socketId, buffer, size, 0);
  return received > 0 ? received : 0;
}

void send(const IPAddress& address, uint16_t port, const uint8_t* data, size_t size) {
  sockaddr_in target{};
  target.sin_family = AF_INET;
  target.sin_port = htons(port);
  target.sin_addr.s_addr = static_cast<uint32_t>(address);
  lwip_sendto(socketId, data, size, 0, reinterpret_cast<sockaddr*>(&target), sizeof(target));
}

}  // namespace udp
