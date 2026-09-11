# 智慧医养医生服务系统前端

基于 Vue 3 + TypeScript + Element Plus 的医生工作平台前端原型，围绕医生端 4 周开发计划实现可演示业务闭环。

## 功能范围

- 登录与角色权限演示：医生、上级医生、管理员
- 医生工作台：问诊、风险患者、待审核病历、AI 辅助统计
- 患者管理：多条件搜索、患者分组、健康数据趋势
- 图文问诊：聊天记录、检查单入口、AI 摘要、病历草稿生成
- 电子病历：结构化 EMR、医嘱、AI 草稿、分级审核
- AI/RAG 医疗助手：病历生成、问诊摘要、相似病例、医嘱核验
- 审计日志：操作记录、越权拦截、AI 生成与审核留痕

## 技术栈

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- ECharts
- @lucide/vue

## 本地运行

```bash
npm install
npm run dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

## 构建

```bash
npm run build
```
