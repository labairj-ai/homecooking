const express = require('express');
const path = require('path');

const recipesRouter = require('./routes/recipes');
const uploadRouter = require('./routes/upload');
const groceryRouter = require('./routes/grocery');
const parseRouter = require('./routes/parse');

const app = express();
const PORT = process.env.PORT || 4100;

app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API routes
app.use('/api/recipes', recipesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/grocery', groceryRouter);
app.use('/api/parse-recipe', parseRouter);

// Serve built React app in production
const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`homecooking server running on port ${PORT}`);
});
