.PHONY: dev backend frontend test lint lint-fix build clean

# ── Defaults ──────────────────────────────────────────────────────────────────
PYTHON := python3.11
PYPROJECT := backend/pyproject.toml
FRONTEND_DIR := frontend

# ── Development ────────────────────────────────────────────────────────────────
dev: docker-up backend frontend
	@echo "Ready. Backend: http://localhost:8000  Frontend: http://localhost:5173"

docker-up:
	docker compose up -d redis
	@echo "Redis started on port 6379"

# ── Backend ───────────────────────────────────────────────────────────────────
backend:
	cd backend && uv sync
	@echo "Backend deps installed."

backend-run:
	cd backend && uv run uvicorn voice_agent.main:app --reload --port 8000

# ── Frontend ──────────────────────────────────────────────────────────────────
frontend:
	cd $(FRONTEND_DIR) && npm install

frontend-run:
	cd $(FRONTEND_DIR) && npm run dev

# ── Testing ────────────────────────────────────────────────────────────────────
test:
	cd backend && uv run pytest tests/ -v --tb=short

test-cov:
	cd backend && uv run pytest tests/ --cov=voice_agent --cov-report=term-missing

# ── Linting ───────────────────────────────────────────────────────────────────
lint:
	cd backend && uv run ruff check src/ tests/
	cd $(FRONTEND_DIR) && npm run lint

lint-fix:
	cd backend && uv run ruff check --fix src/ tests/
	cd $(FRONTEND_DIR) && npx eslint src --fix

typecheck:
	cd backend && uv run mypy src/
	cd $(FRONTEND_DIR) && npm run typecheck

# ── Build ──────────────────────────────────────────────────────────────────────
build:
	cd $(FRONTEND_DIR) && npm run build

# ── Clean ──────────────────────────────────────────────────────────────────────
clean:
	rm -rf backend/.venv
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/dist
	docker compose down -v