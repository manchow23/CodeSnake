# Use official Nginx image
FROM nginx:alpine

# Copy all your website files to Nginx's public directory
COPY . /usr/share/nginx/html

# Expose port 80 for the web server
EXPOSE 80

# Nginx will automatically start when container runs
