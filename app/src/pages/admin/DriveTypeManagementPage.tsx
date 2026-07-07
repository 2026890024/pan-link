import { useState, useRef } from 'react'
import { Plus, Upload, Trash2, X, Image } from 'lucide-react'
import { useDataStore } from '@/store/useDataStore'

export default function DriveTypeManagementPage() {
  const { driveTypes, addDriveType, deleteDriveType } = useDataStore()
  const presetTypes = driveTypes.filter(d => d.id !== 'custom')

  const [isAdding, setIsAdding] = useState(false)
  const [newType, setNewType] = useState({
    id: '',
    name: '',
    color: 'bg-gradient-to-br from-gray-500 to-gray-600',
    icon: '网',
    iconImage: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    if (newType.name.trim()) {
      addDriveType(newType.name.trim(), newType.icon, newType.color)
      setNewType({ id: '', name: '', color: 'bg-gradient-to-br from-gray-500 to-gray-600', icon: '网', iconImage: '' })
      setIsAdding(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setNewType({ ...newType, iconImage: event.target?.result as string })
      }
      reader.readAsDataURL(file)
    }
  }

  const colors = [
    'bg-gradient-to-br from-blue-500 to-blue-600',
    'bg-gradient-to-br from-purple-500 to-purple-600',
    'bg-gradient-to-br from-red-500 to-orange-500',
    'bg-gradient-to-br from-green-500 to-emerald-500',
    'bg-gradient-to-br from-pink-500 to-rose-500',
    'bg-gradient-to-br from-cyan-500 to-blue-500',
    'bg-gradient-to-br from-amber-500 to-yellow-500',
    'bg-gradient-to-br from-indigo-500 to-violet-500',
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">网盘类型管理</h1>
          <p className="text-gray-500 mt-1">管理网盘图标，支持自定义上传</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" /> 添加网盘类型
        </button>
      </div>

      {/* Preset Types */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">预设网盘类型</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {presetTypes.map((drive) => (
            <div key={drive.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className={`w-16 h-16 mx-auto rounded-xl ${drive.color} flex items-center justify-center text-white font-bold text-xl shadow-lg mb-3`}>
                {drive.icon}
              </div>
              <p className="font-medium text-gray-900">{drive.name}</p>
              <p className="text-xs text-gray-400 mt-1">预设类型</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Types */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">自定义网盘类型</h2>
        
        {!isAdding && presetTypes.length === driveTypes.length && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Image className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">暂无自定义网盘类型</p>
            <button onClick={() => setIsAdding(true)} className="mt-4 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              添加自定义网盘
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {driveTypes.filter(d => !presetTypes.includes(d)).map((drive) => (
            <div key={drive.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center relative group">
              <button
                onClick={() => deleteDriveType(drive.id)}
                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className={`w-16 h-16 mx-auto rounded-xl ${drive.color} flex items-center justify-center text-white font-bold text-xl shadow-lg mb-3`}>
                {drive.icon}
              </div>
              <p className="font-medium text-gray-900">{drive.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">添加自定义网盘</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">图标</label>
              <div className="flex items-center gap-4">
                {newType.iconImage ? (
                  <div className="relative">
                    <img src={newType.iconImage} alt="preview" className="w-20 h-20 rounded-xl object-cover" />
                    <button onClick={() => setNewType({ ...newType, iconImage: '' })}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <div className={`w-20 h-20 rounded-xl ${newType.color} flex items-center justify-center text-white font-bold text-2xl`}>{newType.icon}</div>
                )}
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 transition-colors">
                  <Upload className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">上传</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">名称</label>
              <input type="text" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="网盘名称" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color, i) => (
                  <button key={i} onClick={() => setNewType({ ...newType, color })}
                    className={`w-8 h-8 rounded-lg ${color} ${newType.color === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setIsAdding(false); setNewType({ id: '', name: '', color: 'bg-gradient-to-br from-gray-500 to-gray-600', icon: '网', iconImage: '' }) }}
              className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">取消</button>
            <button onClick={handleAdd} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">保存</button>
          </div>
        </div>
      )}
    </div>
  )
}
