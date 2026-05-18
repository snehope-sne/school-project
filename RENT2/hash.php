<?php
echo "admin123:    " . password_hash('admin123',  PASSWORD_BCRYPT) . "\n";
echo "agent123:    " . password_hash('agent123',  PASSWORD_BCRYPT) . "\n";
echo "agent456:    " . password_hash('agent456',  PASSWORD_BCRYPT) . "\n";
?>