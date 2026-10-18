import logging


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
