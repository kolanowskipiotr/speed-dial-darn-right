class SpeedDialDarnRight < Formula
  desc "Self-hosted browser speed-dial page (nginx + Docker)"
  homepage "https://github.com/GITHUB_USER/speed-dial-darn-right"
  license "MIT"

  # ── Stable release ─────────────────────────────────────────────────────────
  # Uncomment and fill in when you publish a GitHub release:
  # url "https://github.com/GITHUB_USER/speed-dial-darn-right/archive/refs/tags/v1.0.0.tar.gz"
  # sha256 "FILL_IN_AFTER_RUNNING: brew fetch --build-from-source Formula/speed-dial-darn-right.rb"
  # version "1.0.0"
  #
  # ── HEAD (install from git, e.g. during development) ──────────────────────
  head "https://github.com/GITHUB_USER/speed-dial-darn-right.git", branch: "main"

  # Docker (with Compose v2) must be installed separately.
  # https://docs.docker.com/get-docker/

  def install
    libexec.install Dir["*"]

    # Wrapper script so brew services can invoke docker compose
    (bin/"speed-dial").write <<~SH
      #!/bin/bash
      exec docker compose -f "#{libexec}/docker-compose.yml" "$@"
    SH
    chmod 0755, bin/"speed-dial"
  end

  def post_install
    unless which("docker")
      opoo "Docker not found — install it first: https://docs.docker.com/get-docker/"
      return
    end
    ohai "Building Docker images (this may take a minute on first install)..."
    system "docker", "compose", "-f", "#{libexec}/docker-compose.yml", "build"
  end

  service do
    # Runs docker compose in the foreground so launchd/systemd can manage the
    # process lifetime. On macOS this is a user LaunchAgent (login item).
    # On Linux (Homebrew) it's a systemd --user service.
    run [opt_bin/"speed-dial", "up", "--remove-orphans"]
    keep_alive true
    log_path var/"log/speed-dial.log"
    error_log_path var/"log/speed-dial.log"
    environment_variables PATH: std_service_path_env
  end

  def caveats
    port = ENV.fetch("PORT", "8998")
    <<~EOS
      Docker (with Compose v2) is required:
        https://docs.docker.com/get-docker/

      Start and enable auto-start at login:
        brew services start speed-dial-darn-right

      Then open: http://localhost:#{port}

      ── Change the port ────────────────────────────────────────────
      Edit #{libexec}/docker-compose.yml and change the ports line,
      then restart: brew services restart speed-dial-darn-right

      ── Useful commands ────────────────────────────────────────────
      brew services stop speed-dial-darn-right    # stop containers
      brew services restart speed-dial-darn-right # restart after config change
      speed-dial logs                             # tail container logs
      speed-dial ps                               # show container status
    EOS
  end
end
