# Deploying homecooking to optiplex

## First-time setup on optiplex

```bash
ssh optiplex@192.168.1.178

# Create dirs
mkdir -p ~/homecooking/client/dist ~/homecooking/uploads

# Install Node 22 (if not already present)
# curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
# sudo apt-get install -y nodejs

# Copy and enable the app service
sudo cp ~/homecooking/homecooking.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable homecooking
sudo systemctl start homecooking

# Set up tailscale instance for Funnel
sudo mkdir -p /var/lib/tailscale-homecooking
sudo cp ~/homecooking/tailscaled-homecooking.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tailscaled-homecooking
sudo systemctl start tailscaled-homecooking

# Auth the new tailscale node (follow the printed URL)
sudo tailscale --socket=/run/tailscale-homecooking/tailscaled.sock up \
  --hostname=homecooking --authkey=<YOUR_AUTHKEY>

# Enable Funnel on port 443 → local 4100
sudo tailscale --socket=/run/tailscale-homecooking/tailscaled.sock funnel \
  --bg 443
```

## Subsequent deploys (from Mac)

```bash
npm run deploy
```

This builds the React app, rsyncs to optiplex, installs server deps, and restarts the service.

## Verify

```
sudo systemctl status homecooking
sudo systemctl status tailscaled-homecooking
curl http://127.0.0.1:4100/api/recipes
```

Public URL: https://homecooking.tailb97cdb.ts.net/
