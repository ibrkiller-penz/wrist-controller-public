# 원래 펌웨어(샤오즈) 백업

- 백업일: 2026-10-16
- 파일: `original_xiaozhi_esp32c6_16MB.bin` (16,777,216 바이트, 플래시 전체 0x0~0x1000000)
- SHA256: `9FAF65FE7D9361FE4EFE9FD21B2B06CF144DC38E8731CAAAC777AE4DF640E6FC`
- 장치: **ESP32-C6** (QFN40, rev v0.2), 플래시 16MB (제조사 0x20, 장치 0x4018), MAC 98:a3:16:a6:2d:38, 포트 COM7 (USB-Serial/JTAG)
- 백업 명령: `python -m esptool --port COM7 read-flash 0 0x1000000 original_xiaozhi_esp32c6_16MB.bin` (esptool v5.4.0)

## 복원 방법

USB로 연결하고 COM 포트를 확인한 뒤 아래 명령을 실행한다. 플래시 전체를 덮어쓴다.

```
python -m esptool --port COM7 write-flash 0 original_xiaozhi_esp32c6_16MB.bin
```

> 이 파일에는 Wi-Fi 설정 등 개인 정보가 들어 있을 수 있으니 공개 저장소에 올리지 않는다.

## 두 번째 시계 (2026-10-17)

- 파일: `original_device2_98a316a5d7c0_16MB.bin` (16,777,216 바이트)
- SHA256: `2862D2D257FD8BB4DA4245905DD1A0BBF793A848E667CE545D13487B2E69EA29`
- 장치: ESP32-C6 rev v0.2, 16MB, MAC 98:a3:16:a5:d7:c0, 포트 COM8
- 복원: `python -m esptool --port COM8 write-flash 0 original_device2_98a316a5d7c0_16MB.bin`
