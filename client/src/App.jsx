import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Cellar from './pages/Cellar';
import GroceryList from './pages/GroceryList';
import RecipeDetail from './pages/RecipeDetail';
import AddEdit from './pages/AddEdit';
import SuggestRecipe from './pages/SuggestRecipe';
import TryIt from './pages/TryIt';
import Nav from './components/Nav';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cellar" element={<Cellar />} />
          <Route path="/cellar/add" element={<AddEdit />} />
          <Route path="/grocery" element={<GroceryList />} />
          <Route path="/suggest" element={<SuggestRecipe />} />
          <Route path="/tryit" element={<TryIt />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/add" element={<AddEdit />} />
          <Route path="/edit/:id" element={<AddEdit />} />
        </Routes>
      </main>
    </div>
  );
}
