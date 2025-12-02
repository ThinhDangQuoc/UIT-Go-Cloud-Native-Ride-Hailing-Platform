# 📋 Architectural Decision Records (ADR)

Thư mục này chứa các bản ghi quyết định kiến trúc (Architectural Decision Records) của dự án UIT-Go.

## 📖 Danh sách ADR

| # | Tên | Mô tả |
|---|-----|-------|
| ADR-0001 | [Microservices Architecture](./1-decide-microservices-architecture.md) | Quyết định sử dụng kiến trúc Microservices thay vì Monolithic |
| ADR-0002 | [Redis cho Driver Location](./2-decide-redis-for-driver-location.md) | Sử dụng Redis Geospatial để quản lý vị trí tài xế thời gian thực |
| ADR-0003 | [REST thay vì gRPC](./3-decide-rest-over-grpc.md) | Lựa chọn REST API cho giao tiếp giữa các microservices |
| ADR-0004 | [Event Streaming Architecture](./4-driver-location-streaming-architecture.md) | Kiến trúc streaming cho cập nhật vị trí tài xế với SQS + Lambda |

## 📝 Cấu trúc một ADR

Mỗi ADR tuân theo cấu trúc:
1. **Bối cảnh** - Tình huống và yêu cầu dẫn đến quyết định
2. **Quyết định** - Lựa chọn cuối cùng
3. **Lý do** - Phân tích trade-offs và lý do kỹ thuật
4. **Hậu quả** - Ảnh hưởng và hạn chế của quyết định
5. **Bằng chứng** - Kết quả thử nghiệm (nếu có)

## 🔗 Tài liệu liên quan

- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) - Kiến trúc hệ thống tổng quan
- [DATAFLOW.md](../docs/DATAFLOW.md) - Dataflow diagrams chi tiết (Mermaid)
- [REPORT.md](../docs/REPORT.md) - Báo cáo module chuyên sâu
- [FINAL-REPORT-DRIVER-LOCATION.md](../docs/FINAL-REPORT-DRIVER-LOCATION.md) - Báo cáo tổng hợp Driver Location
