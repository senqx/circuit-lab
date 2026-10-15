"""Bounded CPU workers for a stateless C++ engine behind an HTTPS proxy."""
import os

bind = "0.0.0.0:" + os.environ.get("PORT", "8000")
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
worker_class = "sync"
timeout = 25
graceful_timeout = 15
max_requests = 2000
max_requests_jitter = 200
limit_request_line = 2048
limit_request_fields = 32
limit_request_field_size = 4096
accesslog = "-"
errorlog = "-"
worker_tmp_dir = "/tmp"
control_socket_disable = True
# Set explicit proxy addresses on the host. Use * only with private ingress.
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1,::1")
