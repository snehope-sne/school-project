FROM php:8.2-apache

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Copy all backend files into Apache's web root
COPY . /var/www/html/

# Install mysqli extension for MySQL
RUN docker-php-ext-install mysqli pdo pdo_mysql

EXPOSE 80