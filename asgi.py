import importlib.util
from a2wsgi import WSGIMiddleware

# Dynamically import the storage-ui module because hyphens in filenames
# prevent standard Python imports (e.g. `import storage-ui` is a SyntaxError).
spec = importlib.util.spec_from_file_location("storage_ui", "storage-ui.py")
storage_ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage_ui)

# Wrap the WSGI Flask app with a2wsgi so Uvicorn can run it natively as ASGI on port 8000
app = WSGIMiddleware(storage_ui.app)
