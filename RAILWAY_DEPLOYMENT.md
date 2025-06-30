# Railway Deployment Guide cho Debt Purchase Subgraph

## Bước 1: Chuẩn bị

1. Đảm bảo bạn có tài khoản Railway: https://railway.app
2. Cài đặt Railway CLI (tùy chọn):
   ```bash
   npm install -g @railway/cli
   railway login
   ```

## Bước 2: Deploy Database

1. Truy cập Railway dashboard
2. Tạo project mới: "debt-purchase-subgraph"
3. Thêm PostgreSQL service:
   - Click "Add Service" → "Database" → "PostgreSQL"
   - Đợi database khởi tạo xong

## Bước 3: Deploy Graph Node

1. Trong cùng project, click "Add Service" → "GitHub Repo"
2. Connect repository này và chọn thư mục `debt-purchasing-subgraph`
3. Railway sẽ tự động detect Dockerfile và build

## Bước 4: Cấu hình Environment Variables

Trong Graph Node service, thêm các biến môi trường:

```
GRAPH_LOG=info
GRAPH_ALLOW_NON_DETERMINISTIC_FULLTEXT_SEARCH=true
PORT=8000
```

Railway sẽ tự động cung cấp `DATABASE_URL` từ PostgreSQL service.

## Bước 5: Deploy Subgraph

Sau khi Graph Node đã chạy, bạn có thể deploy subgraph:

1. Cài đặt Graph CLI:

   ```bash
   npm install -g @graphprotocol/graph-cli
   ```

2. Tạo subgraph.yaml từ template:

   ```bash
   node scripts/prepare-subgraph.js sepolia
   ```

3. Build subgraph:

   ```bash
   graph build
   ```

4. Deploy subgraph:
   ```bash
   graph create --node https://your-railway-app.railway.app debt-purchase
   graph deploy --node https://your-railway-app.railway.app --ipfs https://api.thegraph.com/ipfs/ debt-purchase
   ```

## Bước 6: Kiểm tra

- Graph Node GraphQL Playground: `https://your-railway-app.railway.app`
- Subgraph endpoint: `https://your-railway-app.railway.app/subgraphs/name/debt-purchase`

## Troubleshooting

### Nếu Graph Node không start:

1. Kiểm tra logs trong Railway dashboard
2. Đảm bảo DATABASE_URL đã được set
3. Kiểm tra PostgreSQL service đã running

### Nếu subgraph deploy fail:

1. Kiểm tra contract addresses trong networks.json
2. Đảm bảo ABI files đã được copy vào abis/
3. Kiểm tra startBlock numbers

## Production Notes

- Railway free tier có giới hạn 500 hours/month
- Để production, nên upgrade plan để có resource ổn định
- Cân nhắc setup monitoring và alerting
- Backup database định kỳ
