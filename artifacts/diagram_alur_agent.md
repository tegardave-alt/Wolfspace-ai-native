# Diagram Alur Agent LangGraph

# Diagram Alur Agent (LangGraph)

```mermaid
flowchart TD
  START(["START"])
  PLANNER["🧠 PLANNER
  Buat checklist
  maks 3 langkah"]
  EXECUTOR["🤖 EXECUTOR
  Panggil LLM (askCloudTools)
  + suntik checklist & MCP rules"]
  TOOLS["🔧 TOOLS
  Jalankan tool calls:
  - read / grep / glob
  - edit / bash / write
  - web_search / web_fetch
  - mcp_* / skill_*
  - dll."]
  VALIDATE["��� VALIDATE
  1. Anti-tutorial simulation
  2. Evidence cross-reference
  3. Hallucination guard
  4. Sanitize output
  5. Strip <think> blocks
  6. Truncate 2000 chars"]
  END_NODE(["🏁 END"])

  START -->|"hitlApproved=true"| EXECUTOR
  START -->|"ada kata kode/task"| PLANNER
  START -->|"lainnya (search/lookup)"| EXECUTOR

  PLANNER --> EXECUTOR

  EXECUTOR -->|"tool_calls ditemukan"| TOOLS
  EXECUTOR -->|"plain text (no tools)"| VALIDATE
  EXECUTOR -->|"stopReason (cancelled/error)"| END_NODE

  TOOLS -->|"stopReason"| END_NODE
  TOOLS -->|"step ≥ stepCeiling"| END_NODE
  TOOLS -->|"lanjut"| EXECUTOR

  VALIDATE -->|"stopReason='finished'"| END_NODE
  VALIDATE -->|"force retry (simulasi/halusinasi)"| EXECUTOR
```

## Penjelasan Alur

1. **START** → conditional router: jika ada HITL pending langsung ke executor; jika task membutuhkan kode/eksekusi, masuk planner; selain itu langsung executor.
2. **Planner** → membuat _checklist 3 langkah_ singkat sebagai panduan, lalu lanjut ke executor.
3. **Executor** → memanggil LLM dengan seluruh riwayat pesan + checklist aktif + aturan tools. LLM bisa membalas dengan **tool_calls** (lanjut ke tools) atau **jawaban teks** (lanjut ke validate).
4. **Tools** → mengeksekusi semua tool call yang diminta LLM. Hasilnya dikembalikan sebagai `tool` messages. Jika jumlah langkah melebihi `stepCeiling`, graph berhenti (dapat di-resume nanti).
5. **Validate** → filter multi-tahap: deteksi simulasi/tutorial palsu, cross-reference klaim terhadap bukti tool nyata, guard halusinasi, strip blok `<think>`, dan potong prosa ke 2000 karakter. (Sanitasi kata spekulatif sudah **dihapus**: ia menyisipkan penanda `[kata-spekulatif-dihapus]` ke tengah kalimat yang tampil ke user, dan menghapus katanya saja akan mengubah dugaan jadi pernyataan pasti.) Jika lolos → **END**; jika ada masalah → **force retry** (executor dipanggil ulang dengan peringatan).

**Loop utama:** `executor → tools → executor → tools → ... → validate → (END atau executor)`
