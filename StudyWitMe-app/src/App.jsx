import { useState } from 'react'
import './App.css'
import logo from "./assets/logo.svg"

function App() {
  const [formData, setFormData] = useState(
    {
      username: "",
      email:"",
      password:"",
    }
  )

  const handleChange=(e) =>{
    const{username, value}=e.target
    setFormData((prev) =>({
      ...prev, [username]:value,

    }))
  }

  const handleSubmit=(e) =>{
    e.preventDefault();
    console.log("Signing up: ", formData)
    //we'll put the firebase complicated stuff ehre
  }

  return (
      <nav className="navbar">
        <div className="nav-left">
          <img src={logo} alt="robot logo" className="nav-logo"/>  
        </div>
        <div className="nav-right">
          <a href="">Signup</a>
          <a href="">Login</a>
          <a href="">Flashcards</a>
        </div>
      </nav>
  )
}

export default App
