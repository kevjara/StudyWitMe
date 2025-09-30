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

  return (
    <>
      <h1>test</h1>
    </>
  )
}

export default App
